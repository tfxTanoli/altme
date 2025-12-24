
'use client';

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader, Shield } from "lucide-react";
import { useUser, useFirebase } from "@/firebase";
import { ref, onValue, update, push, set, query, orderByChild, equalTo, serverTimestamp } from "firebase/database";
import type { PhotographerProfile, User, PortfolioItem } from "@/lib/types";
import { useProfilePhotoUpload } from "@/hooks/use-profile-photo-upload";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countries } from "@/lib/countries";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePortfolioMediaUpload } from "@/hooks/use-portfolio-media-upload";
import { PortfolioGallery } from "@/components/photographers/portfolio-gallery";

const profileFormSchema = z.object({
    name: z.string().min(2, { message: "Name must be at least 2 characters." }),
    bio: z.string().optional(),
    serviceCountry: z.string().optional(),
    areas: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
    const { user, isUserLoading } = useUser();
    const { database } = useFirebase();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = React.useState(false);

    // --- Data State ---
    const [userData, setUserData] = React.useState<User | null>(null);
    const [photographerProfile, setPhotographerProfile] = React.useState<PhotographerProfile | undefined>(undefined);
    const [portfolioItems, setPortfolioItems] = React.useState<PortfolioItem[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);

    // --- Hooks for uploads ---
    const {
        isUploading: isAvatarUploading,
        fileInputRef: avatarFileInputRef,
        handleFileChange: handleAvatarFileChange,
        triggerFileInput: triggerAvatarFileInput
    } = useProfilePhotoUpload();
    const {
        isUploading: isPortfolioUploading,
        fileInputRef: portfolioFileInputRef,
        handleFileChange: handlePortfolioFileChange,
        triggerFileInput: triggerPortfolioFileInput,
    } = usePortfolioMediaUpload(photographerProfile, setPortfolioItems);

    // --- Form Setup ---
    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: { name: '', bio: '', serviceCountry: '', areas: '' },
    });

    React.useEffect(() => {
        if (isUserLoading || !user || !database) {
            if (!isUserLoading && !user) setIsLoading(false);
            return;
        }

        const unsubscribes: (() => void)[] = [];

        const fetchDataAndListen = async () => {
            setIsLoading(true);

            try {
                // 1. Listen to user data (Realtime Database: users/uid)
                const userRef = ref(database, `users/${user.uid}`);
                const unsubUser = onValue(userRef, (snapshot) => {
                    if (snapshot.exists()) {
                        const fetchedUserData = { id: snapshot.key, ...snapshot.val() } as User;
                        setUserData(fetchedUserData);
                        form.reset({ name: fetchedUserData.name || '', bio: fetchedUserData.bio || '' });
                    }
                });
                unsubscribes.push(() => unsubUser());

                // 2. Listen to profile data (Realtime Database: Query photographerProfiles by userId)
                const profilesRef = query(ref(database, 'photographerProfiles'), orderByChild('userId'), equalTo(user.uid));
                const unsubProfile = onValue(profilesRef, (snapshot) => {
                    if (snapshot.exists()) {
                        // In RTDB, query results are objects with keys. We take the first match.
                        const data = snapshot.val();
                        const profileId = Object.keys(data)[0];
                        const fetchedProfile = { id: profileId, ...data[profileId] } as PhotographerProfile;

                        setPhotographerProfile(fetchedProfile);
                        form.reset(prev => ({
                            ...prev,
                            serviceCountry: fetchedProfile.serviceCountry || '',
                            areas: fetchedProfile.areas?.join(', ') || '',
                        }));

                        // 3. Listen to portfolio items (Realtime Database: photographerProfiles/profileId/portfolioItems)
                        const portfolioRef = ref(database, `photographerProfiles/${profileId}/portfolioItems`);
                        const unsubPortfolio = onValue(portfolioRef, (pfSnapshot) => {
                            if (pfSnapshot.exists()) {
                                const pfData = pfSnapshot.val();
                                const items = Object.entries(pfData).map(([key, value]: [string, any]) => ({
                                    id: key,
                                    ...value
                                })) as PortfolioItem[];
                                // Sort client-side since RTDB default order might be by push key (chronological)
                                items.sort((a, b) => (b.createdAt as any) - (a.createdAt as any));
                                setPortfolioItems(items);
                            } else {
                                setPortfolioItems([]);
                            }
                        });
                        unsubscribes.push(() => unsubPortfolio());

                    } else {
                        // No profile found
                        setPhotographerProfile(undefined);
                    }
                    setIsLoading(false);
                }, (error) => {
                    console.error("Error listening to profile:", error);
                    setIsLoading(false);
                });
                unsubscribes.push(() => unsubProfile());

            } catch (error) {
                console.error("Error fetching initial profile data:", error);
                setIsLoading(false);
            }
        };

        fetchDataAndListen();
        return () => unsubscribes.forEach(unsub => unsub());

    }, [isUserLoading, user, database, form]);


    // --- Event Handlers ---
    async function onSubmit(values: ProfileFormValues) {
        if (!user || !database) return;

        setIsSaving(true);
        try {
            // 1. Update the main user document
            const userRef = ref(database, `users/${user.uid}`);
            await update(userRef, { name: values.name, bio: values.bio });

            // 2. Handle Photographer Profile (Create or Update)
            const areas = values.areas ? values.areas.split(',').map(a => a.trim()).filter(Boolean) : [];

            if (photographerProfile) { // Update existing profile
                const profileRef = ref(database, `photographerProfiles/${photographerProfile.id}`);
                await update(profileRef, {
                    bio: values.bio || "",
                    serviceCountry: values.serviceCountry || "",
                    areas
                });
            } else { // Create new profile
                const profilesRef = ref(database, 'photographerProfiles');
                const newProfileRef = push(profilesRef);
                const newProfileData: PhotographerProfile = {
                    id: newProfileRef.key as string,
                    userId: user.uid,
                    bio: values.bio || "",
                    serviceCountry: values.serviceCountry || "",
                    areas,
                    isAcceptingRequests: true, // Default to true on creation
                };
                await set(newProfileRef, newProfileData);
                setPhotographerProfile(newProfileData);
            }

            toast({
                title: "Profile Saved",
                description: "Your changes have been successfully saved.",
            });
        } catch (error) {
            console.error("Error saving profile:", error);
            toast({
                variant: 'destructive',
                title: "Something went wrong",
                description: "Could not save your changes. Please try again."
            });
        } finally {
            setIsSaving(false);
        }
    }

    const handleAcceptingRequestsToggle = async (checked: boolean) => {
        if (!user || !database) return;

        let profileId = photographerProfile?.id;

        // If profile doesn't exist, create it first
        if (!profileId) {
            try {
                const profilesRef = ref(database, 'photographerProfiles');
                const newProfileRef = push(profilesRef);
                const newProfileData: PhotographerProfile = {
                    id: newProfileRef.key as string,
                    userId: user.uid,
                    isAcceptingRequests: checked,
                };
                await set(newProfileRef, newProfileData);
                setPhotographerProfile(newProfileData);
                profileId = newProfileRef.key as string;
                toast({
                    title: 'Photographer Profile Created',
                    description: 'You can now manage your request availability.',
                });
            } catch (error) {
                toast({
                    variant: 'destructive',
                    title: 'Update Failed',
                    description: 'Could not create a profile to update your status.',
                });
                return;
            }
        }

        if (profileId) {
            try {
                const profileRef = ref(database, `photographerProfiles/${profileId}`);
                await update(profileRef, { isAcceptingRequests: checked });
                // Optimistic update
                setPhotographerProfile(prev => prev ? { ...prev, isAcceptingRequests: checked } : undefined);
            } catch (error) {
                console.error("Error toggling accepting requests status:", error);
                toast({
                    variant: 'destructive',
                    title: 'Update Failed',
                    description: 'Could not update your availability status.',
                });
            }
        }
    };

    // --- Derived State & Render ---
    const effectivePhotoURL = user?.photoURL || userData?.photoURL;

    if (isLoading || !user || !userData) {
        return (
            <main className="flex flex-1 items-center justify-center">
                <Loader className="h-8 w-8 animate-spin" />
            </main>
        );
    }




    return (
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <div className="mx-auto grid w-full max-w-4xl gap-6">
                <div className="flex items-center justify-between gap-4">
                    <h1 className="font-semibold text-lg md:text-2xl">My Profile</h1>
                    {userData.role === 'admin' && (
                        <Button variant="outline" asChild>
                            <Link href="/dashboard" className="gap-2">
                                <Shield className="h-4 w-4" />
                                Admin Dashboard
                            </Link>
                        </Button>
                    )}
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Personal Information</CardTitle>
                                <CardDescription>Update your personal details here.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-20 w-20">
                                        {effectivePhotoURL && <AvatarImage src={effectivePhotoURL} alt={userData.name} data-ai-hint="person avatar" />}
                                        <AvatarFallback>{userData.name?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <Input type="file" ref={avatarFileInputRef} onChange={handleAvatarFileChange} className="hidden" accept="image/png, image/jpeg, image/gif" />
                                    <Button type="button" variant="outline" onClick={triggerAvatarFileInput} disabled={isAvatarUploading}>
                                        {isAvatarUploading ? <><Loader className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : "Change Photo"}
                                    </Button>
                                </div>

                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl><Input placeholder="Enter your name" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="bio"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Bio</FormLabel>
                                            <FormControl><Textarea placeholder="Tell us a little about yourself" className="min-h-[120px]" {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>My Portfolio</CardTitle>
                                <CardDescription>Showcase your best work to attract clients.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <input
                                    type="file"
                                    ref={portfolioFileInputRef}
                                    onChange={handlePortfolioFileChange}
                                    className="hidden"
                                    multiple
                                    accept="image/*,video/*"
                                />
                                <PortfolioGallery
                                    items={portfolioItems}
                                    setItems={setPortfolioItems}
                                    profileId={photographerProfile?.id || ''}
                                    isOwnProfile={true}
                                    onUploadClick={triggerPortfolioFileInput}
                                    isLoading={isPortfolioUploading}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Photographer Settings</CardTitle>
                                <CardDescription>Manage your public photographer profile. Fill this out to appear in public listings and bid on projects.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label className="text-base">Availability</Label>
                                    <div className="flex items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-sm font-medium">
                                                Accepting new requests
                                            </FormLabel>
                                            <FormDescription className="text-xs">
                                                Turn this off if you're not available for new projects.
                                            </FormDescription>
                                        </div>
                                        <Switch
                                            checked={photographerProfile?.isAcceptingRequests ?? true}
                                            onCheckedChange={handleAcceptingRequestsToggle}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="serviceCountry"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Country</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value || ''}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select a country" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {countries.map((country) => (
                                                            <SelectItem key={country.value} value={country.value}>
                                                                {country.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="areas"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>City / Area</FormLabel>
                                                <FormControl><Input placeholder="e.g., New York, Los Angeles" {...field} /></FormControl>
                                                <FormDescription>Comma-separated list of cities or regions.</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-center">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </div>
                    </form>
                </Form>
            </div>
        </main>
    )
}
