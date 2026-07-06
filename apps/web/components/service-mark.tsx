import Image, { type ImageProps } from "next/image";

type ServiceMarkProps = Omit<ImageProps, "alt" | "height" | "src" | "width"> & {
  alt?: string;
};

export function ServiceMark({ alt = "", ...props }: ServiceMarkProps) {
  return (
    <Image
      alt={alt}
      aria-hidden={alt ? undefined : true}
      height={64}
      src="/selfchecks-icon.png"
      width={64}
      {...props}
    />
  );
}
