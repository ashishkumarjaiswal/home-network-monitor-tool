"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/devices", label: "Hotspot devices" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1" aria-label="Main">
      {links.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? "rounded-lg bg-[var(--ink)] px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--ink)]"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
