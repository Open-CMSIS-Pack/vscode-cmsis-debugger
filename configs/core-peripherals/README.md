# Core Peripherals Index (`core-peripherals-index.yml`)

This file lists SCVD files and optional conditions that decide whether each file is loaded for
a CPU connection. The input for the condition is based on the selected core and its available
features as described under `system-resources`>`processors` in the `*.cbuild-run.yml` file.

## File format

```yaml
core-peripherals:
  - file: Nested_Vectored_Interrupt_Controller_M33_with_TZ.scvd
    cpu-type: Cortex-M33
    cpu-features:
      trustzone: present
    info: Example for a CPU specific NVIC description.

  - file: My_M55_M85_CorePeripheral.scvd
    cpu-type:
      - Cortex-M55
      - Cortex-M85
    cpu-features:
      mve: fp
      dsp: present
      fpu: dp
    info: Example for a core peripheral description valid for multiple CPU types with available CPU features.

  - file: Memory_Protection_Unit.scvd
    cpu-type: "*"
    cpu-features:
      mpu: present
      fpu: "*"
    info: Example for wildcard usage
```

- `file` (required): Path to an SCVD file, relative to this folder (`configs/core-peripherals`).
- `cpu-type` (optional): String or list of strings matching processor `core` from `system-resources`>`processors` in `*.cbuild-run.yml`.
- `cpu-features` (optional): Key/value map matched against processor properties.
- `info` (optional): Free-text description.

## Filtering behavior

### Processor selection

- If the core connection's `pname` matches a child node of `system-resources`>`processors`, then that processor is used.
- If `pname` is missing, then a single-core system is assumed. Hence, the first processor in the list is used.
- If no processors are available, the collector treats the processor as unknown. In this case only entries without `cpu-type`/`cpu-features`
constraints, those using the "*" wildcard, and those using value `none` will match; entries requiring a specific `cpu-type` or specific feature values are excluded.

### `cpu-type` matching

- If omitted or set to the `"*"` wildcard, then entry is valid for all CPU types.
- Otherwise, SCVD files are loaded if the connection's core matches one of the given `core` values.
Matching is case-insensitive.

### `cpu-features` matching

- If omitted, no feature constraints are applied.
- All listed feature conditions must match (`AND` logic).
- Feature must exist in the selected processor object and values must match (case-insensitive).
- Feature value `"*"` matches any value for that key that indicates presence of the feature.

## Feature keys and allowed values

Use feature keys that can appear on a processor entry in `system-resources`>`processors` of `*.cbuild-run.yml`.

- `fpu`: `sp`, `dp`, `none`
- `mpu`: `present`, `none`
- `dsp`: `present`, `none`
- `trustzone`: `present`, `none`
- `mve`: `int`, `fp`, `none`
- `pacbti`: `present`, `none`
- `endian`: `little`, `big`, `configurable`

Additional notes for filter behavior:

- `cpu-features` keys are matched exactly by key name (for example `mpu`, not `MPU`).
- Feature value comparison is case-insensitive after converting values to strings.
- If a key is listed in `cpu-features` but missing on the selected processor, the entry only matches if it has the value `none`.
This is to reflect that a missing processor feature usually means it is not implemented.
- Use `"*"` as a feature value to accept any value for that key that indicates presence of the feature.
