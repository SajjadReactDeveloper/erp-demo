'use client';
import { createContext, useContext } from 'react';

/** Route prefix of the current surface: staff '/app', customer portal '/portal', supplier portal '/supplier'. */
const B = createContext('/app');
export const BaseProvider = B.Provider;
export const useBase = () => useContext(B);
