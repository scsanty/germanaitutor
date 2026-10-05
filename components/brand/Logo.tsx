import { cn } from '@/lib/utils';
import { LOGO_SVG } from './logoSvg.generated';

// Spec: Brand. The user's logo exactly as supplied in public/brand/nadoch-logo.svg, rendered inline
// (its filters, decorations and tagline included). The markup comes from a generated module so this
// works in client components; the only change is hiding the inner <svg> so the name is read once.
const MARKUP = LOGO_SVG.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

// The SVG fills its box (width/height 100%), so the wrapper keeps the 860×460 aspect ratio and the
// caller sets the width.
export function Logo({ className, title = 'NaDoch!' }: { className?: string; title?: string }) {
  return <span role="img" aria-label={title} className={cn('block aspect-[860/460] [&>svg]:block [&>svg]:size-full', className)} dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
