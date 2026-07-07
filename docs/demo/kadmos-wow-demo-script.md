# Kadmos Wow Demo Script

## Goal

Show a non-technical evaluator that Kadmos prevents model intent from becoming unsafe execution.

## Flow

1. Open Talos from the Laravel control-plane.
2. Upload `api-spec.json` or use a prepared benchmark scenario.
3. Run AVM ON/OFF comparison.
4. Point out that AVM OFF can produce an invalid node reference or unsafe action.
5. Show AVM ON rejecting the invalid mutation before a worker executes.
6. Open the fault explainer:
   - technical field;
   - plain-language explanation;
   - execution consequence;
   - recovery path.
7. Open trace replay and step through:
   - LLM proposed mutation;
   - validator accepted/rejected;
   - DAG state changed;
   - execution skipped unsafe mutation.
8. Export or inspect the report.

## Closing Line

The LLM can be creative, but execution is governed.
