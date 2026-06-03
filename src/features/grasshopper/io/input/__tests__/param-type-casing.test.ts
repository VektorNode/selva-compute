import { describe, expect, it } from 'vitest';
import { processInputWithError } from '@/features/grasshopper/io/input/input-processors';
import { createInputSchema } from '@tests/helpers/test-data-builders';

// Selva schemas emit lowercase paramTypes (e.g. "valueList") while the plugin
// reports capitalized ones (e.g. "ValueList"). The processor normalizes casing
// so either form resolves to the same canonical type instead of throwing
// "Unsupported paramType".
describe('paramType casing normalization', () => {
	it('accepts a lowercase "valueList" and canonicalizes it', () => {
		const input = createInputSchema({
			paramType: 'valueList',
			values: { Abstand: '0', Länge: '1' },
			default: '0'
		});

		const { input: result, error } = processInputWithError(input);

		expect(error).toBeUndefined();
		expect(result.paramType).toBe('ValueList');
	});

	it.each([
		['number', 'Number'],
		['boolean', 'Boolean'],
		['TEXT', 'Text'],
		['color', 'Color']
	])('canonicalizes "%s" to "%s"', (given, expected) => {
		const input = createInputSchema({ paramType: given });
		const { input: result, error } = processInputWithError(input);
		expect(error).toBeUndefined();
		expect(result.paramType).toBe(expected);
	});

	it('still reports genuinely unknown paramTypes', () => {
		const input = createInputSchema({ paramType: 'definitelyNotAType' });
		const { error } = processInputWithError(input);
		expect(error?.code).toBe('VALIDATION_ERROR');
		expect(error?.message).toContain('definitelyNotAType');
	});
});
