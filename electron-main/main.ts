import { bootstrapAppLifecycle } from './startup/appLifecycle';
import { registerPrivilegedSchemes } from './startup/protocols';

registerPrivilegedSchemes();
bootstrapAppLifecycle();
