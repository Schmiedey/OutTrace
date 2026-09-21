export const PRODUCT_HUNT_URL =
  "https://www.producthunt.com/products/outtrace?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-outtrace";

export const PRODUCT_HUNT_IMAGE_URL =
  "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1256657&theme=light&t=1789954186451";

export function ProductHuntBadge({ className }: { className?: string }) {
  return (
    <a
      href={PRODUCT_HUNT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <img
        alt="OutTrace — Track website third parties and catch changes early | Product Hunt"
        width={250}
        height={54}
        src={PRODUCT_HUNT_IMAGE_URL}
        className="h-[54px] w-[250px] max-w-full"
      />
    </a>
  );
}
