// apps/lab — deviceName automático (UI-07, 06-03 task 2, D-02).
//
// `getDeviceName(): string` = `${modelo ?? 'tablet-android'} ${AAAA-MM-DD}`
// truncado para 100 chars e validado com patDeviceNameSchema do contracts
// antes do POST (ex.: "Galaxy Tab A9 2026-09-12"). Reinstalação gera novo PAT
// naturalmente (SecureStore limpo → novo login → novo deviceName+data). Sem
// revogação pela web na fase 6 (fase futura per D-02).

import * as Device from 'expo-device';
import { patDeviceNameSchema } from '@uhhu/contracts';

const DEVICE_FALLBACK_MODEL = 'tablet-android';
const DEVICE_NAME_MAX = 100;

function currentDateSuffix(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDeviceName(): string {
  const model: string | null = Device.modelName ?? Device.deviceName;
  const base =
    typeof model === 'string' && model.trim().length > 0 ? model.trim() : DEVICE_FALLBACK_MODEL;
  const candidate = `${base} ${currentDateSuffix()}`.slice(0, DEVICE_NAME_MAX);
  // Valida com a MESMA regra do servidor (1..100); se falhar, fallback seguro.
  const parsed = patDeviceNameSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }
  return patDeviceNameSchema.parse(`${DEVICE_FALLBACK_MODEL} ${currentDateSuffix()}`);
}
