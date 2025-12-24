'use client';

import { useFirebase } from './provider';
import { Database } from 'firebase/database';

/** Hook to access Firebase Realtime Database instance. */
export const useDatabase = (): Database => {
    const { database } = useFirebase();
    return database;
};
