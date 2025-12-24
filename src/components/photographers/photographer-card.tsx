
'use client';

import Link from 'next/link';
import Image from 'next/image';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { PhotographerProfile, User, Review, PortfolioItem } from '@/lib/types';
import { getImageUrl, cn } from '@/lib/utils';
import { ArrowUpRight, Loader, Video, Star, MapPin } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import React from 'react';
import { countries } from '@/lib/countries';
import { useUser } from '@/firebase';


type PhotographerCardProps = {
  photographer: User & { profile?: PhotographerProfile; portfolioItems?: PortfolioItem[], averageRating: number, reviewCount: number };
};

const PhotographerCard = React.memo(({
  photographer,
}: PhotographerCardProps) => {
  const { user } = useUser();
  const photographerUser = photographer;
  const photographerProfile = photographer.profile;
  const portfolioItems = photographer.portfolioItems || [];
  
  const averageRating = photographer.averageRating || 0;
  const reviewCount = photographer.reviewCount || 0;

  const country = countries.find(c => c.value === photographerProfile?.serviceCountry);
  const areas = photographerProfile?.areas?.join(', ');

  const profileLink = user ? `/photographers/${photographerUser.id}` : '/signup';

  return (
    <Link href={profileLink} className="block h-full">
        <Card className="flex flex-col h-full hover:shadow-lg transition-shadow">
         <CardContent className="p-0">
            {portfolioItems.length > 0 ? (
                <Carousel className="w-full">
                <CarouselContent>
                    {portfolioItems.map((item) => (
                    <CarouselItem key={item.id}>
                        <div className="relative aspect-video w-full">
                            <Image
                                src={item.thumbnailUrl || item.mediaUrl}
                                alt={item.description || 'Portfolio item'}
                                fill
                                className="object-contain"
                                data-ai-hint="portfolio image"
                            />
                            {item.mediaType === 'video' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                    <Video className="h-8 w-8 text-white" />
                                </div>
                            )}
                        </div>
                    </CarouselItem>
                    ))}
                </CarouselContent>
                {portfolioItems.length > 1 && (
                    <>
                        <CarouselPrevious className="left-2" />
                        <CarouselNext className="right-2" />
                    </>
                )}
            </Carousel>
            ) : (
            <div className="aspect-video w-full bg-muted flex items-center justify-center">
                <span className="text-sm text-muted-foreground">No portfolio yet</span>
            </div>
            )}
        </CardContent>
        <CardHeader className="flex-row items-center gap-4 pt-2 p-4 flex-1">
            <Avatar className="h-12 w-12 border">
                <AvatarImage src={photographerUser.photoURL} alt={photographerUser.name} data-ai-hint="person portrait" />
                <AvatarFallback>{photographerUser.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
                <CardTitle className="text-lg truncate">
                    {photographerUser.name}
                </CardTitle>
                <div>
                    {reviewCount > 0 ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-semibold text-foreground">{averageRating.toFixed(1)}</span>
                            <span>({reviewCount})</span>
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground mt-1">No reviews yet</div>
                    )}
                    {(areas || country) ? (
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 flex-shrink-0" />
                            <div className="flex items-baseline gap-1 overflow-hidden">
                                <span className="truncate">{areas}</span>
                                {areas && country && <span>,</span>}
                                {country && <span className="flex-shrink-0">{country.label}</span>}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 flex-shrink-0 invisible" />
                            <span>&nbsp;</span>
                        </div>
                    )}
                </div>
            </div>
        </CardHeader>
        </Card>
    </Link>
  );
});

PhotographerCard.displayName = 'PhotographerCard';
export default PhotographerCard;
