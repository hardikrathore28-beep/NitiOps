import { ToolAdapter } from './ToolAdapter';
import { RestAdapter } from './RestAdapter';
import { SoapAdapter } from './SoapAdapter';

const registry: Record<string, ToolAdapter> = {
    'rest': new RestAdapter(),
    'soap': new SoapAdapter(),
};

export const getAdapter = (type: string): ToolAdapter | undefined => {
    return registry[type];
};

export * from './ToolAdapter';
export * from './RestAdapter';
export * from './SoapAdapter';
