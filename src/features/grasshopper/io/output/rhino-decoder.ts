import type { RhinoModule } from 'rhino3dm';
import { getLogger } from '@/core';

// -----------------------------------------------------------------------------
// Decoder Types
// -----------------------------------------------------------------------------

type RhinoDecoder = (rhino: RhinoModule, data: unknown) => unknown;

const decoderRegistry = new Map<string, RhinoDecoder>();

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

export function registerDecoder(typeName: string, decoder: RhinoDecoder): void {
	decoderRegistry.set(typeName, decoder);
}

registerDecoder('Rhino.Geometry.Point3d', (rhino, data) => {
	const d = data as any;
	if (!d || typeof d.X !== 'number') return null;
	return new rhino.Point([d.X, d.Y, d.Z]);
});

registerDecoder('Rhino.Geometry.Line', (rhino, data) => {
	const d = data as any;
	if (!d || !d.From || !d.To) return null;
	return new rhino.Line([d.From.X, d.From.Y, d.From.Z], [d.To.X, d.To.Y, d.To.Z]);
});

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

function findDecoder(rhinoType: string): RhinoDecoder | undefined {
	if (decoderRegistry.has(rhinoType)) return decoderRegistry.get(rhinoType);
	for (const [key, dec] of decoderRegistry) {
		if (rhinoType.startsWith(key)) return dec;
	}
	return undefined;
}

function extractPayload(parsedData: any): any {
	if (!parsedData || typeof parsedData !== 'object') return null;
	return (parsedData as any).data ?? (parsedData as any).value ?? null;
}

// -----------------------------------------------------------------------------
// Geometry Decoding
// -----------------------------------------------------------------------------

export function decodeRhinoGeometry(
	parsedData: unknown,
	rhinoType: string,
	rhino: RhinoModule
): unknown {
	const decoder = findDecoder(rhinoType);
	if (decoder) {
		try {
			return decoder(rhino, parsedData);
		} catch (error) {
			getLogger().warn(`Failed to decode Rhino type ${rhinoType}:`, error);
		}
	}

	// Fallback using CommonObject.decode
	try {
		const payload = extractPayload(parsedData);
		if (payload) return rhino.CommonObject.decode(payload);
	} catch (error) {
		getLogger().warn(`Failed to decode ${rhinoType} with CommonObject:`, error);
		return { __decodeError: true, type: rhinoType, raw: parsedData };
	}

	return parsedData;
}

// -----------------------------------------------------------------------------
// Object Decoder
// -----------------------------------------------------------------------------

export interface DecodeRhinoOptions {
	keys?: string[];
	skipKeys?: string[];
	deep?: boolean;
}

export function decodeRhinoObject<T extends Record<string, unknown>>(
	obj: T,
	rhino: RhinoModule,
	options: DecodeRhinoOptions = {}
): T {
	const { keys, skipKeys, deep } = options;
	const out: Record<string, unknown> = { ...obj };

	const shouldProcessKey = (k: string) => {
		if (skipKeys?.includes(k)) return false;
		if (keys && !keys.includes(k)) return false;
		return true;
	};

	for (const [key, value] of Object.entries(obj)) {
		if (!shouldProcessKey(key)) continue;
		if (!value || typeof value !== 'object') continue;

		const v: any = value;
		const maybeType = typeof v.type === 'string' ? v.type : undefined;

		if (maybeType) {
			out[key] = decodeRhinoGeometry(v, maybeType, rhino);
			continue;
		}

		if (deep && typeof v === 'object') {
			out[key] = decodeRhinoObject(v as any, rhino, options);
		}
	}

	return out as T;
}
