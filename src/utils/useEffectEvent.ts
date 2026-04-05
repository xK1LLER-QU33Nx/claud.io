import { useCallback, useLayoutEffect, useRef } from 'react';

export function useEffectEvent<T extends Function>(fn: T): T {
    const ref = useRef<T>(fn);
    useLayoutEffect(() => {
        ref.current = fn;
    });
    // @ts-expect-error - we know this is a function and it's safe to cast
    return useCallback((...args: any[]) => {
        return ref.current(...args);
    }, []);
}
