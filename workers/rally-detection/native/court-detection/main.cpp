#include <opencv2/opencv.hpp>
#include <cstdlib>
#include <exception>
#include <cmath>
#include <string>

#include "TimeMeasurement.h"
#include "Line.h"
#include "CourtLinePixelDetector.h"
#include "CourtLineCandidateDetector.h"
#include "BadmintonCourtFitter.h"
#include "DebugHelpers.h"

using namespace cv;

int main(int argc, char** argv)
{
  TimeMeasurement::debug = false;
  CourtLinePixelDetector::debug = false;
  CourtLineCandidateDetector::debug = false;
  BadmintonCourtFitter::debug = false;

  if (argc != 3)
  {
    std::cerr << "Usage: mintonix-court-detect video_path output.csv" << std::endl;
    return -1;
  }
  std::string filename(argv[1]);

  std::cout << "Reading file " << filename << std::endl;
  VideoCapture vc(filename);
  if (!vc.isOpened())
  {
    std::cerr << "Cannot open file " << filename << std::endl;
    return 1;
  }
  printVideoInfo(vc);
  Mat frame;

  int totalFrames = int(vc.get(cv::CAP_PROP_FRAME_COUNT));
  int startFrame = totalFrames * 0.2; // Start of the middle 60%

  std::srand(0); // Deterministic fits for repeated jobs.
  int frameIndex = startFrame;
  const char* frameEnv = std::getenv("COURT_DETECT_FRAME");
  if (frameEnv != nullptr)
  {
    frameIndex = std::atoi(frameEnv);
    if (frameIndex < 0 || frameIndex >= totalFrames)
    {
      std::cerr << "COURT_DETECT_FRAME is outside the video frame range: " << frameIndex << std::endl;
      return 2;
    }
  }

  vc.set(cv::CAP_PROP_POS_FRAMES, frameIndex);
  if (!vc.read(frame))
  {
    std::cerr << "Failed to read frame with index " << frameIndex << std::endl;
    return 2;
  }
  std::cout << "Reading frame with index " << frameIndex << std::endl;

  Mat processingFrame = frame;
  double scaleX = 1.0;
  double scaleY = 1.0;
  int maxWidth = 960;
  const char* maxWidthEnv = std::getenv("COURT_DETECT_MAX_WIDTH");
  if (maxWidthEnv != nullptr)
  {
    maxWidth = std::atoi(maxWidthEnv);
  }
  if (maxWidth > 0 && frame.cols > maxWidth)
  {
    double scale = maxWidth / static_cast<double>(frame.cols);
    Size processingSize(maxWidth, int(std::round(frame.rows * scale)));
    resize(frame, processingFrame, processingSize, 0, 0, INTER_AREA);
    scaleX = frame.cols / static_cast<double>(processingFrame.cols);
    scaleY = frame.rows / static_cast<double>(processingFrame.rows);
    std::cout << "Using resized detection frame " << processingFrame.cols << "x"
              << processingFrame.rows << " (scale back " << scaleX << "x, "
              << scaleY << "x)" << std::endl;
  }

  CourtLinePixelDetector courtLinePixelDetector;
  CourtLineCandidateDetector courtLineCandidateDetector;
  BadmintonCourtFitter tennisCourtFitter;

  std::cout << "Starting court line detection algorithm..." << std::endl;
  try
  {
    TimeMeasurement::start("LineDetection");
    Mat binaryImage = courtLinePixelDetector.run(processingFrame);
    std::vector<Line> candidateLines = courtLineCandidateDetector.run(binaryImage, processingFrame);
    BadmintonCourtModel model = tennisCourtFitter.run(candidateLines, binaryImage, processingFrame);
    if (scaleX != 1.0 || scaleY != 1.0)
    {
      model.scaleCoordinates(scaleX, scaleY);
    }
    int elapsed_seconds = TimeMeasurement::stop("LineDetection");
    std::cout << "Elapsed time: " << elapsed_seconds << "s." << std::endl;

    model.writeToFile(argv[2]);
    std::cout << "Result written to " << argv[2] << std::endl;

  }
  catch (std::runtime_error& e)
  {
    std::cout << "Processing error: " << e.what() << std::endl;
    return 3;
  }
  catch (const cv::Exception& e)
  {
    std::cout << "OpenCV processing error: " << e.what() << std::endl;
    return 4;
  }
  catch (const std::exception& e)
  {
    std::cout << "Processing error: " << e.what() << std::endl;
    return 5;
  }

  return 0;
}
