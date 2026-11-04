import * as SecureStore from 'expo-secure-store';
import { savedComputerSchema, type SavedComputer } from '@openfactory/client';
import { z } from 'zod';

const key = 'openfactory.computers';
const catalogSchema = z.object({
  computers: z.array(savedComputerSchema),
  selectedId: z.string().nullable(),
});
export type ComputerCatalog = z.infer<typeof catalogSchema>;
export async function loadComputers(): Promise<ComputerCatalog> {
  const saved = await SecureStore.getItemAsync(key);
  return saved ? catalogSchema.parse(JSON.parse(saved)) : { computers: [], selectedId: null };
}
export async function saveComputers(catalog: ComputerCatalog) {
  await SecureStore.setItemAsync(key, JSON.stringify(catalogSchema.parse(catalog)), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
export async function forgetComputers() {
  await SecureStore.deleteItemAsync(key);
}
export async function saveComputer(computer: SavedComputer) {
  const catalog = await loadComputers();
  const next = {
    computers: [...catalog.computers.filter((item) => item.hostId !== computer.hostId), computer],
    selectedId: computer.hostId,
  };
  await saveComputers(next);
  return next;
}
