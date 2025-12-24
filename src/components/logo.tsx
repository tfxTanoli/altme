import Image from 'next/image';
import * as React from 'react';

export const Logo = () => {
  const logoUrl = "https://firebasestorage.googleapis.com/v0/b/studio-2849852647-a0602.firebasestorage.app/o/altme.png?alt=media&token=9dc85e61-622b-4583-9877-64ee6deb9359";

  return (
    <div className="flex items-center gap-2">
      <img src={logoUrl} alt="AltMe Logo" width={24} height={24} className="h-6 w-6" />
      <span className="font-headline text-xl font-semibold">AltMe</span>
    </div>
  );
};
