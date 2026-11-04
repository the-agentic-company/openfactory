import { z } from 'zod';

// Read assignments saved or sent by versions that used the previous terminology.
const legacyAssignment = z
  .object({
    runnerEnabled: z.boolean().optional(),
    runnerRevision: z.string().optional(),
  })
  .loose();
export function migrateMachineAssignment(input: unknown) {
  const parsed = legacyAssignment.safeParse(input);
  if (!parsed.success) {
    return input;
  }
  const { runnerEnabled, runnerRevision, ...project } = parsed.data;
  return {
    ...project,
    machineEnabled: project.machineEnabled ?? runnerEnabled,
    machineRevision: project.machineRevision ?? runnerRevision,
  };
}
