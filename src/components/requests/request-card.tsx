
'use client';

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ProjectRequest } from '@/lib/types';
import { MapPin, Calendar, DollarSign, Clock, Star, ThumbsUp } from 'lucide-react';
import { countries } from '@/lib/countries';
import { useUser } from '@/firebase';
import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type RequestCardProps = {
  request: ProjectRequest;
  hideStatus?: boolean;
  hasNotification?: boolean;
};

const RequestCard = React.memo(({ request, hideStatus = false, hasNotification = false }: RequestCardProps) => {
  const { user } = useUser();

  const isClientAwaitingPayment = request.status === 'Pending' && request.photographerRespondedAt && user?.uid === request.userId;
  const linkHref = user ? `/requests/${request.id}` : '/signup';

  const getStatusInfo = () => {
    if (isClientAwaitingPayment) {
      return {
        text: 'Pending Payment',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      };
    }

    const statusConfig: { [key: string]: { text: string, className: string } } = {
      'Open': { text: 'Open', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
      'In Progress': { text: 'In Progress', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
      'Delivered': { text: 'Delivered', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
      'Completed': { text: 'Completed', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
      'Pending': { text: 'Pending Approval', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' },
      'Disputed': { text: 'Disputed', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
      'Disabled': { text: 'Disabled', className: 'bg-gray-500 text-white' },
    };

    return statusConfig[request.status] || { text: request.status, className: 'bg-gray-100 text-gray-800' };
  };

  const { text: statusText, className: statusColor } = getStatusInfo();

  const country = countries.find(c => c.value === request.country);
  const locationDisplay = country ? `${request.location}, ${country.label}` : request.location;


  return (
    <div className={cn(
      "flex flex-col h-full rounded-xl border bg-card text-card-foreground shadow",
      hasNotification && "border-primary"
    )}>
      <CardHeader className="relative">
        <Link href={linkHref} className="hover:underline">
          <CardTitle className="leading-snug text-lg truncate">
            {request.title}
          </CardTitle>
        </Link>
        <div className='flex justify-between items-center'>
          <CardDescription className="truncate">
            Posted by{' '}
            <Link href={user ? `/photographers/${request.userId}` : '/signup'} className="hover:underline text-foreground font-medium">
              {request.postedBy}
            </Link>
          </CardDescription>
          {!hideStatus && <Badge className={statusColor}>{statusText}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <Link href={linkHref} className="block">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-h-[20px] overflow-hidden">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            {request.location ? <span>{locationDisplay}</span> : <span>&nbsp;</span>}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-h-[20px] mt-2">
            <Calendar className="h-4 w-4" />
            {request.dates && request.dates.length > 0 ? <span className="truncate">{request.dates.join(', ')}</span> : <span>&nbsp;</span>}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground truncate mt-2">
            <DollarSign className="h-4 w-4 flex-shrink-0" />
            <span>{request.budget.toLocaleString()} Budget</span>
          </div>
          {request.status === 'Pending' && (
            isClientAwaitingPayment ? (
              <div className="flex items-center gap-2 text-sm text-blue-500 mt-2">
                <ThumbsUp className="h-4 w-4" />
                <span>Photographer approved! Please complete payment.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-orange-500 mt-2">
                <Clock className="h-4 w-4" />
                <span>Awaiting photographer's approval</span>
              </div>
            )
          )}
        </Link>
      </CardContent>
    </div>
  );
});

RequestCard.displayName = 'RequestCard';
export default RequestCard;
