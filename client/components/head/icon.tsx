import type { CSSProperties } from "react";

export type IconName =
  | "alert" | "box" | "chart" | "check" | "clock" | "file" | "grid" | "logout"
  | "pin" | "refresh" | "sliders" | "truck" | "upload" | "user" | "users" | "x";

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const mask = "url(/assets/icons/" + name + ".svg)";
  const style: CSSProperties = {
    width: size,
    height: size,
    maskImage: mask,
    WebkitMaskImage: mask,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  };
  return <span aria-hidden="true" className="inline-block shrink-0 bg-current" style={style} />;
}
