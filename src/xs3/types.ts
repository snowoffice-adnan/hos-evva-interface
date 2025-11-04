export type CommandStatus = 'ok' | 'error';

export type CommandOutcome = {
    status: CommandStatus;
    mediumId?: string;
    message?: string;
    ackPending?: boolean;
    propagationPending?: boolean;
    errorCode?: number;
    reason?: string;
    [k: string]: any;
};
