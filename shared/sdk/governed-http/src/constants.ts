import { ACTIONS, ActionType } from '@nitiops/constants';

export { ACTIONS };

export const actionFrom = (action: ActionType): string => {
    return action;
};

export const HTTP_HEADERS = {
    PURPOSE: 'X-Purpose',
    REQUEST_ID: 'X-Request-ID',
    TRACE_ID: 'X-Trace-ID'
};
