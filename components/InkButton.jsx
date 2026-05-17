"use client";
import Link from "next/link";

export default function InkButton({
  children,
  variant = "primary",
  size = "md",
  href,
  external,
  as,
  className = "",
  ...rest
}) {
  const cls = `ink-btn ink-btn--${size} ink-btn--${variant} ${className}`.trim();

  if (href && !external) {
    return <Link href={href} className={cls} {...rest}>{children}</Link>;
  }

  if (href && external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>{children}</a>;
  }

  const Tag = as ?? "button";
  return <Tag className={cls} {...rest}>{children}</Tag>;
}
