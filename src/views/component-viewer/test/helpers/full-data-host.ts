/**
 * Test-only helper for evaluator host typing.
 */
import type { DataAccessHost, ModelHost } from '../../parser-evaluator/model-host';
import type { IntrinsicProvider } from '../../parser-evaluator/intrinsics';

export type FullDataHost = ModelHost & DataAccessHost & IntrinsicProvider;
