/**
 * Test-only helper for evaluator host typing.
 */
import type { DataAccessHost, ModelHost } from '../../model-host';
import type { IntrinsicProvider } from '../../intrinsics';

export type FullDataHost = ModelHost & DataAccessHost & IntrinsicProvider;
