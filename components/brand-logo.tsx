import Image from 'next/image';

const VARIANTS = {
  color: '/images/brand/osr-tree.png',
  onDark: '/images/brand/osr-tree-on-dark.png',
} as const;

export type BrandLogoVariant = keyof typeof VARIANTS;

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  /** Rendered width/height in CSS pixels (square mark). */
  size?: number;
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  variant = 'color',
  size = 32,
  className = '',
  priority = false,
}: BrandLogoProps) {
  return (
    <Image
      src={VARIANTS[variant]}
      alt="Open Source Resume"
      width={size}
      height={size}
      className={`flex-shrink-0 object-contain ${className}`.trim()}
      priority={priority}
    />
  );
}
