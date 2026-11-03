import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Mintonix home">
      <Image src="/brand/logomark.png" alt="" width={29} height={33} />
      <span>mintonix</span>
    </Link>
  );
}
