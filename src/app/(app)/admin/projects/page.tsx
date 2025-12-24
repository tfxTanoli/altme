
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useFirestore, errorEmitter, FirestorePermissionError, useUser, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, orderBy, doc, getDocs, updateDoc, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import type { ProjectRequest } from '@/lib/types';
import { Loader, MoreHorizontal, AlertCircle, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ProjectTable = ({ 
    projects, 
    onDisableProject,
    onResolveDispute
}: { 
    projects: ProjectRequest[], 
    onDisableProject: (project: ProjectRequest) => void,
    onResolveDispute: (project: ProjectRequest) => void,
}) => {
    
    const getStatusBadge = (status: ProjectRequest['status']) => {
        switch (status) {
            case 'Open': return <Badge variant="default">Open</Badge>;
            case 'In Progress': return <Badge variant="secondary">In Progress</Badge>;
            case 'Delivered': return <Badge className="bg-yellow-500 text-white">Delivered</Badge>;
            case 'Completed': return <Badge variant="outline">Completed</Badge>;
            case 'Pending': return <Badge className="bg-orange-500 text-white">Pending</Badge>;
            case 'Disabled': return <Badge variant="destructive">Disabled</Badge>;
            case 'Disputed': return <Badge variant="destructive">Disputed</Badge>;
            default: return <Badge variant="secondary">{status}</Badge>;
        }
    }

    if (projects.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                <p>No projects in this category.</p>
            </div>
        );
    }
    
    return (
        <Table>
            <TableHeader>
            <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {projects?.map((request) => (
                <TableRow key={request.id}>
                <TableCell className="font-medium">
                    <Link
                    href={`/requests/${request.id}`}
                    className="hover:underline"
                    >
                    {request.title}
                    </Link>
                </TableCell>
                <TableCell>${request.budget.toLocaleString()}</TableCell>
                <TableCell>
                    {getStatusBadge(request.status)}
                </TableCell>
                <TableCell>{request.date || 'N/A'}</TableCell>
                <TableCell className="text-right">
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                         {request.status === 'Disputed' && (
                            <>
                                <DropdownMenuItem onClick={() => onResolveDispute(request)}>
                                    Resolve Dispute
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                         )}
                        <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDisableProject(request)}
                        disabled={request.status === 'Disabled'}
                        >
                        Disable Project
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
                </TableRow>
            ))}
            </TableBody>
        </Table>
    )
};


export default function AdminProjectsPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [projectToDisable, setProjectToDisable] = React.useState<ProjectRequest | null>(null);
  const [projectToResolve, setProjectToResolve] = React.useState<ProjectRequest | null>(null);
  const [allProjects, setAllProjects] = React.useState<ProjectRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isDisabling, setIsDisabling] = React.useState(false);
  const [isResolving, setIsResolving] = React.useState(false);
  
  React.useEffect(() => {
    if(!firestore) return;
    const fetchProjects = async () => {
        setIsLoading(true);
        try {
            const projectsQuery = query(collection(firestore, 'requests'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(projectsQuery).catch(err => {
                errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'requests', operation: 'list' }));
                throw err;
            });
            const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectRequest));
            setAllProjects(projectsData);

            if(user) {
              const disputedCount = projectsData.filter(p => p.status === 'Disputed').length;
              const userRef = doc(firestore, 'users', user.uid);
              updateDocumentNonBlocking(userRef, { disputedProjectsCount: disputedCount });
            }

        } catch(error) {
            if (!(error instanceof FirestorePermissionError)) {
               console.error("Error fetching projects:", error);
            }
            setAllProjects([]);
        } finally {
            setIsLoading(false);
        }
    }
    fetchProjects();
  }, [firestore, user]);


  const handleDisableProject = async () => {
    if (!firestore || !projectToDisable) return;
    setIsDisabling(true);
    
    const requiresRefund = projectToDisable.status === 'In Progress' || projectToDisable.status === 'Delivered' || projectToDisable.status === 'Disputed';
    const refundAmount = projectToDisable.acceptedBidAmount || projectToDisable.budget;

    try {
        const batch = writeBatch(firestore);

        const projectRef = doc(firestore, 'requests', projectToDisable.id);
        const updateData = { status: 'Disabled' as const };
        batch.update(projectRef, updateData);

        if(requiresRefund) {
            const clientUserRef = doc(firestore, 'users', projectToDisable.userId);
            batch.update(clientUserRef, {
                balance: increment(refundAmount)
            });
        }
        
        await batch.commit();
        
        toast({
            title: 'Project Disabled',
            description: requiresRefund
              ? `The project "${projectToDisable.title}" has been disabled and $${refundAmount} has been credited to the client's balance.`
              : `The project "${projectToDisable.title}" has been disabled. No payment was processed.`,
        });
        setAllProjects(prev => prev.map(p => p.id === projectToDisable.id ? { ...p, status: 'Disabled' } : p));

    } catch (error: any) {
        console.error("Error disabling project:", error);
        toast({
            variant: 'destructive',
            title: 'Operation Failed',
            description: 'Could not disable the project. Check security rules.',
        });
    } finally {
      setIsDisabling(false);
      setProjectToDisable(null);
    }
  };

  const handleRefundClient = async () => {
    if (!firestore || !projectToResolve) return;
    setIsResolving(true);
    const refundAmount = projectToResolve.acceptedBidAmount || projectToResolve.budget;

    try {
        const batch = writeBatch(firestore);
        const projectRef = doc(firestore, 'requests', projectToResolve.id);
        const clientUserRef = doc(firestore, 'users', projectToResolve.userId);

        batch.update(projectRef, { 
            status: 'Completed',
            disputeResolution: 'refunded',
            disputeResolvedAt: serverTimestamp(),
        });
        batch.update(clientUserRef, { 
            balance: increment(refundAmount),
        });


        await batch.commit();

        toast({
            title: 'Dispute Resolved: Client Refunded',
            description: `$${refundAmount} has been credited to the client's balance.`,
        });
        setAllProjects(prev => prev.map(p => p.id === projectToResolve.id ? { ...p, status: 'Completed' } : p));
    } catch (error) {
        console.error("Error refunding client:", error);
        toast({ variant: 'destructive', title: 'Refund Failed', description: 'Could not process the refund.' });
    } finally {
        setIsResolving(false);
        setProjectToResolve(null);
    }
  }

  const handlePayPhotographer = async () => {
    if (!firestore || !projectToResolve || !projectToResolve.hiredPhotographerId) return;
    setIsResolving(true);
    const paymentAmount = projectToResolve.acceptedBidAmount || projectToResolve.budget;

     try {
        const batch = writeBatch(firestore);
        const projectRef = doc(firestore, 'requests', projectToResolve.id);
        const photographerUserRef = doc(firestore, 'users', projectToResolve.hiredPhotographerId);

        batch.update(projectRef, { 
            status: 'Completed',
            disputeResolution: 'paid',
            disputeResolvedAt: serverTimestamp(),
        });
        batch.update(photographerUserRef, { 
            balance: increment(paymentAmount),
        });


        await batch.commit();

        toast({
            title: 'Dispute Resolved: Photographer Paid',
            description: `$${paymentAmount} has been released to the photographer's balance.`,
        });
        setAllProjects(prev => prev.map(p => p.id === projectToResolve.id ? { ...p, status: 'Completed' } : p));
    } catch (error) {
        console.error("Error paying photographer:", error);
        toast({ variant: 'destructive', title: 'Payment Failed', description: 'Could not release funds to the photographer.' });
    } finally {
        setIsResolving(false);
        setProjectToResolve(null);
    }
  }

  const disputedProjects = React.useMemo(() => allProjects.filter(p => p.status === 'Disputed'), [allProjects]);
  const activeProjects = React.useMemo(() => allProjects.filter(p => p.status !== 'Disabled'), [allProjects]);


  return (
    <>
      <AlertDialog
        open={!!projectToDisable}
        onOpenChange={(open) => !open && setProjectToDisable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable the project. If a payment was made, the amount will be credited to the client's internal balance. This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisabling}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisableProject} disabled={isDisabling}>
              {isDisabling && <Loader className="mr-2 h-4 w-4 animate-spin" />}
              Disable Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog
        open={!!projectToResolve}
        onOpenChange={(open) => !open && setProjectToResolve(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Dispute</AlertDialogTitle>
            <AlertDialogDescription>
                Choose an action to resolve the dispute for the project "{projectToResolve?.title}". This action is irreversible and will complete the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">Select one of the options below to close the dispute. The project status will be set to 'Completed'.</p>
              <div className="grid grid-cols-2 gap-4">
                  <Button variant="outline" onClick={handleRefundClient} disabled={isResolving}>
                      {isResolving ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                      Refund Client & Cancel
                  </Button>
                  <Button onClick={handlePayPhotographer} disabled={isResolving}>
                      {isResolving ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      Pay Photographer & Complete
                  </Button>
              </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResolving}>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex items-center">
          <h1 className="font-semibold text-lg md:text-2xl">Manage Projects</h1>
        </div>
        
        {isLoading ? (
            <div className="flex justify-center items-center h-64">
                <Loader className="h-8 w-8 animate-spin" />
            </div>
        ) : (
            <Card>
                <CardHeader>
                    <CardTitle>All Project Requests</CardTitle>
                    <CardDescription>
                    View and manage all project requests across the platform.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="active">
                        <TabsList className="grid w-full grid-cols-2 md:w-fit">
                            <TabsTrigger value="active">All Active</TabsTrigger>
                            <TabsTrigger value="disputed" className="relative">
                                Disputed
                                {disputedProjects.length > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
                                        {disputedProjects.length}
                                    </span>
                                )}
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="active" className="mt-4">
                            <ProjectTable projects={activeProjects} onDisableProject={setProjectToDisable} onResolveDispute={setProjectToResolve} />
                        </TabsContent>
                        <TabsContent value="disputed" className="mt-4">
                             {disputedProjects.length > 0 && (
                                <Alert variant="destructive" className="mb-4">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Action Required</AlertTitle>
                                    <AlertDescription>
                                        These projects have been flagged for review. Please investigate and take appropriate action.
                                    </AlertDescription>
                                </Alert>
                            )}
                            <ProjectTable projects={disputedProjects} onDisableProject={setProjectToDisable} onResolveDispute={setProjectToResolve} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        )}

      </main>
    </>
  );
}
