"""Inference-only TrackNetV5.

Architecture matches the released TrackNetV5.pt checkpoint:
  3 RGB frames (B, 9, H, W)
    -> MDD motion channels
    -> 13-ch backbone / neck
    -> R-STR head
    -> 3 sigmoid heatmaps (B, 3, H, W)

Training-size input is 288x512. Weights will not load into a different head
grid; keep that resolution at inference time.
"""

from pathlib import Path

import torch
import torch.nn as nn


class MDD(nn.Module):
    """Motion-direction channels from consecutive-frame luminance diffs."""

    def __init__(self):
        super().__init__()
        self.a = nn.Parameter(torch.tensor(0.2))
        self.b = nn.Parameter(torch.tensor(0.15))
        self.register_buffer("R_WEIGHT", torch.tensor(0.299).view(1, 1, 1, 1))
        self.register_buffer("G_WEIGHT", torch.tensor(0.587).view(1, 1, 1, 1))
        self.register_buffer("B_WEIGHT", torch.tensor(0.114).view(1, 1, 1, 1))

    def _luma(self, rgb):
        return (
            self.R_WEIGHT * rgb[:, 0:1]
            + self.G_WEIGHT * rgb[:, 1:2]
            + self.B_WEIGHT * rgb[:, 2:3]
        )

    def _norm(self, x):
        scale = 5.0 / (0.45 * torch.abs(torch.tanh(self.a)) + 1e-6)
        return 1.0 / (1.0 + torch.exp(-scale * (torch.abs(x) - 0.6 * torch.tanh(self.b))))

    def forward(self, x):
        prev = self._luma(x[:, 0:3])
        curr = self._luma(x[:, 3:6])
        nxt = self._luma(x[:, 6:9])
        d1 = curr - prev
        d2 = nxt - curr
        return torch.cat(
            [
                self._norm(torch.relu(d1)),
                self._norm(torch.relu(-d1)),
                self._norm(torch.relu(d2)),
                self._norm(torch.relu(-d2)),
            ],
            dim=1,
        )


class ConvBlock(nn.Module):
    def __init__(self, cin, cout, k=3):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(cin, cout, k, padding=(k - 1) // 2, bias=False),
            nn.ReLU(inplace=True),
            nn.BatchNorm2d(cout),
        )

    def forward(self, x):
        return self.conv(x)


class TrackNetV2Backbone(nn.Module):
    def __init__(self, in_channels=13):
        super().__init__()
        self.conv1 = ConvBlock(in_channels, 64)
        self.conv2 = ConvBlock(64, 64)
        self.pool1 = nn.MaxPool2d(2, 2)
        self.conv3 = ConvBlock(64, 128)
        self.conv4 = ConvBlock(128, 128)
        self.pool2 = nn.MaxPool2d(2, 2)
        self.conv5 = ConvBlock(128, 256)
        self.conv6 = ConvBlock(256, 256)
        self.conv7 = ConvBlock(256, 256)
        self.pool3 = nn.MaxPool2d(2, 2)
        self.conv8 = ConvBlock(256, 512)
        self.conv9 = ConvBlock(512, 512)
        self.conv10 = ConvBlock(512, 512)

    def forward(self, x):
        x = self.conv2(self.conv1(x))
        skip1 = x
        x = self.conv4(self.conv3(self.pool1(x)))
        skip2 = x
        x = self.conv7(self.conv6(self.conv5(self.pool2(x))))
        skip3 = x
        x = self.conv10(self.conv9(self.conv8(self.pool3(x))))
        return {"skip1": skip1, "skip2": skip2, "skip3": skip3, "bottleneck": x}


class TrackNetV2Neck(nn.Module):
    def __init__(self):
        super().__init__()
        self.ups1 = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
        self.conv11 = ConvBlock(512 + 256, 256)
        self.conv12 = ConvBlock(256, 256)
        self.conv13 = ConvBlock(256, 256)
        self.ups2 = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
        self.conv14 = ConvBlock(256 + 128, 128)
        self.conv15 = ConvBlock(128, 128)
        self.ups3 = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
        self.conv16 = ConvBlock(128 + 64, 64)
        self.conv17 = ConvBlock(64, 64)

    def forward(self, features):
        x = self.ups1(features["bottleneck"])
        x = self.conv13(self.conv12(self.conv11(torch.cat([x, features["skip3"]], dim=1))))
        x = self.ups2(x)
        x = self.conv15(self.conv14(torch.cat([x, features["skip2"]], dim=1)))
        x = self.ups3(x)
        return self.conv17(self.conv16(torch.cat([x, features["skip1"]], dim=1)))


class FusionLayerTypeA(nn.Module):
    def forward(self, inputs):
        feature_map, attention_map = inputs
        return torch.stack(
            [
                feature_map[:, 0],
                feature_map[:, 1] * attention_map[:, 0],
                feature_map[:, 2] * attention_map[:, 2],
            ],
            dim=1,
        )


class R_STRHead(nn.Module):
    def __init__(
        self,
        in_channels=64,
        out_channels=3,
        img_size=(288, 512),
        patch_size=16,
        embed_dim=256,
        num_transformer_layers=4,
        num_transformer_heads=2,
    ):
        super().__init__()
        self.patch_size = patch_size
        self.embed_dim = embed_dim
        self.fusion_layer = FusionLayerTypeA()
        self.draft_head = nn.Conv2d(in_channels, out_channels, 1, bias=False)
        self.embed_conv = nn.Conv2d(1, embed_dim, patch_size, stride=patch_size)
        h_feat = img_size[0] // patch_size
        w_feat = img_size[1] // patch_size
        self.spatial_pos_embed = nn.Parameter(torch.randn(1, h_feat * w_feat, embed_dim))
        self.time_embed = nn.Parameter(torch.randn(1, 3, embed_dim))
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=embed_dim,
            nhead=num_transformer_heads,
            batch_first=True,
            dim_feedforward=embed_dim * 4,
            dropout=0.1,
        )
        self.transformer_encoder = nn.TransformerEncoder(
            encoder_layer, num_layers=num_transformer_layers
        )
        self.decoder_head = nn.Sequential(
            nn.Conv2d(embed_dim, patch_size ** 2, 1),
            nn.PixelShuffle(patch_size),
        )
        self.final_sigmoid = nn.Sigmoid()

    def forward(self, x, residual_maps):
        draft = self.fusion_layer([self.draft_head(x), residual_maps])
        b, _, h, w = draft.shape
        h_feat, w_feat = h // self.patch_size, w // self.patch_size
        pos = self.spatial_pos_embed
        time = self.time_embed

        tokens = []
        for t in range(3):
            emb = self.embed_conv(draft[:, t : t + 1])
            flat = emb.flatten(2).permute(0, 2, 1)
            tokens.append(flat + pos + time[:, t].unsqueeze(1))

        repaired = self.transformer_encoder(torch.cat(tokens, dim=1))
        chunks = torch.chunk(repaired, 3, dim=1)

        residuals = []
        for chunk in chunks:
            feat = chunk.permute(0, 2, 1).reshape(b, self.embed_dim, h_feat, w_feat)
            residuals.append(self.decoder_head(feat))
        return self.final_sigmoid(draft + torch.cat(residuals, dim=1))


class TrackNetV5(nn.Module):
    def __init__(self):
        super().__init__()
        self.mdd = MDD()
        self.backbone = TrackNetV2Backbone(in_channels=13)
        self.neck = TrackNetV2Neck()
        self.head = R_STRHead(in_channels=64, out_channels=3)

    def forward(self, x):
        att = self.mdd(x)
        x13 = torch.cat(
            [x[:, 0:3], att[:, 0:2], x[:, 3:6], att[:, 2:4], x[:, 6:9]],
            dim=1,
        )
        return self.head(self.neck(self.backbone(x13)), att)


def load_tracknet(checkpoint, device):
    path = Path(checkpoint)
    if not path.is_file():
        raise FileNotFoundError(f"TrackNetV5 checkpoint not found: {path}")
    model = TrackNetV5()
    state = torch.load(str(path), map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    return model.to(device).eval()
