import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

// vitest-axe 0.1.0 ships an empty 'vitest-axe/extend-expect', so register the matchers directly.
expect.extend(axeMatchers);
