// Where power-saving mode is remembered (see lib/hooks/usePowerSaving). Its
// own file, free of React, so the root layout's head script can read it
// from a server component.
export const POWER_SAVING_KEY = "signage:power-saving";
