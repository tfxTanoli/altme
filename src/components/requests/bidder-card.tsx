
'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase';
import type {
  Bid,
  User,
} from '@/lib/types';
import React from 'react';
import { ProjectRequest } from '@/lib/types';
import { Skeleton } from '../ui/skeleton';


type EnrichedBid = Bid & {
  bidderUser?: User;
};

const BidderCard = ({
  bid,
  request,
  onAcceptBid,
  onCancelBid,
}: {
  bid: EnrichedBid;
  request: ProjectRequest;
  onAcceptBid: (bid: EnrichedBid) => void;
  onCancelBid: (bid: Bid) => void;
}) => {
  const { user: currentUser } = useUser();
  
  const bidderUser = bid.bidderUser;

  const isOwner = currentUser?.uid === request.userId;
  const isBidOwner = currentUser?.uid === bid.userId;

  if (!bidderUser) {
    return (
        <div className="flex items-start gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
            </div>
        </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <Avatar>
        <AvatarImage
          src={bidderUser.photoURL}
          alt={bidderUser.name}
          data-ai-hint="person portrait"
        />
        <AvatarFallback>{bidderUser.name.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href={`/photographers/${bidderUser.id}`}
              className="font-semibold hover:underline"
            >
              {bidderUser.name}
            </Link>
            <p className="text-sm text-muted-foreground break-all">
              ${bid.amount.toLocaleString()}
            </p>
          </div>
            <div className="flex items-center gap-2">
              {isOwner && request.status === 'Open' && (
                <>
                  <Button size="sm" onClick={() => onAcceptBid(bid)}>Accept Bid</Button>
                </>
              )}
              {isBidOwner && request.status === 'Open' && (
                 <Button variant="destructive" size="sm" onClick={() => onCancelBid(bid)}>
                    Cancel Bid
                </Button>
              )}
            </div>
        </div>
        {bid.notes && (
          <p className="mt-2 rounded-md bg-slate-100 p-3 text-sm text-muted-foreground">
            {bid.notes}
          </p>
        )}
      </div>
    </div>
  );
};

export default BidderCard;
