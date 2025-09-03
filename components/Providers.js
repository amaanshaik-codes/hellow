"use client";
import * as Tooltip from '@radix-ui/react-tooltip';

export default function Providers({ children }){
  return (
    <Tooltip.Provider delayDuration={250}>
      {children}
    </Tooltip.Provider>
  );
}
