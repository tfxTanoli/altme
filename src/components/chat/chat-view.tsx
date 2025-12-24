
'use client';

import * as React from 'react';
import Image from 'next/image';
import { useUser, useFirestore } from '@/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  doc,
  writeBatch,
  addDoc,
  getDocs,
  where,
  runTransaction,
} from 'firebase/firestore';
import type { User, ChatRoom, ChatMessage } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader, Send, ArrowLeft, Paperclip, X, Video, FileImage, FileVideo } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, captureVideoFrame } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useChatMediaUpload } from '@/hooks/use-chat-media-upload';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ChatViewProps {
  partner?: User;
  partners?: User[];
  chatRoom: ChatRoom | null;
  onBack?: () => void;
  allUsersMap?: Map<string, User>;
}

type Preview = {
    url: string;
    type: 'image' | 'video';
};

export const ChatView: React.FC<ChatViewProps> = ({
  partner,
  partners,
  chatRoom,
  onBack,
  allUsersMap,
}) => {
  const { user: currentUser } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = React.useState(false);
  const [newMessage, setNewMessage] = React.useState('');
  const viewportRef = React.useRef<HTMLDivElement>(null);
  
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { uploadFiles, isUploading } = useChatMediaUpload();

  const finalPartners = partners || (partner ? [partner] : []);

  React.useEffect(() => {
    if (!chatRoom || !firestore) {
      setMessages([]);
      return;
    }
  
    const roomIds = chatRoom.isUnified ? chatRoom.sourceRoomIds : [chatRoom.id];
    if (!roomIds || roomIds.length === 0) {
      setMessages([]);
      return;
    }
  
    // Create listeners for all source rooms
    const unsubscribes = roomIds.map(roomId => {
      const messagesQuery = query(
        collection(firestore, 'chatRooms', roomId, 'chatMessages'),
        orderBy('timestamp', 'asc')
      );
      return onSnapshot(messagesQuery, () => {
        // When any room has a new message, refetch all
        fetchAllMessages();
      }, (error) => {
        console.error(`Error fetching messages for room ${roomId}:`, error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Could not load messages from one of the chat rooms.`,
        });
      });
    });
  
    const fetchAllMessages = async () => {
      try {
        const allMessages: ChatMessage[] = [];
        for (const roomId of roomIds) {
          const messagesQuery = query(
            collection(firestore, 'chatRooms', roomId, 'chatMessages'),
            orderBy('timestamp', 'asc')
          );
          const querySnapshot = await getDocs(messagesQuery);
          const roomMessages = querySnapshot.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() } as ChatMessage)
          );
          allMessages.push(...roomMessages);
        }
        // Sort all messages by timestamp
        allMessages.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
        setMessages(allMessages);
      } catch (error) {
        console.error("Error fetching all messages:", error);
      }
    };
  
    fetchAllMessages();
  
    return () => unsubscribes.forEach(unsub => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatRoom, firestore, toast]);
  
  React.useEffect(() => {
    if (viewportRef.current) {
      setTimeout(() => {
        if(viewportRef.current) {
            viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages, preview]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newMessage.trim();
    if ((!text && !selectedFile) || !currentUser || !firestore || !chatRoom) return;

    const currentPartner = partner || (partners && partners.length > 0 ? partners[0] : null);
    if (!currentPartner) return;
    
    setIsSending(true);
  
    try {
        let targetRoomId: string | null;

        if (chatRoom.isProjectChat) {
            targetRoomId = chatRoom.id;
        } else {
            // Find or create a non-project chat room to send the message
            targetRoomId = await runTransaction(firestore, async (transaction) => {
                const participants = [currentUser.uid, currentPartner.id].sort();
                
                // Query for an existing direct chat
                const chatQuery = query(
                    collection(firestore, 'chatRooms'),
                    where('isProjectChat', '==', false),
                    where('participantIds', '==', participants)
                );
                const chatSnap = await getDocs(chatQuery);
                
                if (!chatSnap.empty) {
                    return chatSnap.docs[0].id;
                } else {
                    // If no direct chat exists, create one
                    const newRoomRef = doc(collection(firestore, 'chatRooms'));
                    const newRoomData: Omit<ChatRoom, 'id'> = {
                        participantIds: participants,
                        user1Id: participants[0],
                        user2Id: participants[1],
                        isProjectChat: false,
                        lastMessage: null,
                    };
                    transaction.set(newRoomRef, { ...newRoomData, id: newRoomRef.id });
                    return newRoomRef.id;
                }
            });
        }

        if (!targetRoomId) {
            throw new Error("Could not find or create a chat room for sending the message.");
        }
        
        const uploadedMedia = await uploadFiles(selectedFile ? [selectedFile] : [], targetRoomId);
        const batch = writeBatch(firestore);
        
        const messageRef = doc(collection(firestore, 'chatRooms', targetRoomId, 'chatMessages'));
        
        const messageData: Partial<ChatMessage> = {
            id: messageRef.id,
            chatRoomId: targetRoomId,
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
        };

        if (text) messageData.message = text;
        if (uploadedMedia.length > 0) {
            const media = uploadedMedia[0];
            messageData.mediaType = media.type;
            messageData.mediaName = media.name;
            if (media.type === 'image') {
                messageData.imageUrl = media.url;
            } else {
                messageData.videoUrl = media.url;
                messageData.thumbnailUrl = media.thumbnailUrl || undefined;
            }
        }
        
        batch.set(messageRef, messageData);
  
        const roomRef = doc(firestore, 'chatRooms', targetRoomId);
        let lastMessageText = text;
        if (uploadedMedia.length > 0) {
            lastMessageText = uploadedMedia[0].type === 'image' ? 'Sent an image' : 'Sent a video';
            if(text) lastMessageText = text;
        }

        batch.update(roomRef, {
          lastMessage: {
            text: lastMessageText,
            timestamp: serverTimestamp(),
            senderId: currentUser.uid
          },
          hasUnreadMessages: {
            [currentUser.uid]: false,
            [currentPartner.id]: true
          }
        });
  
        await batch.commit();

        setNewMessage('');
        setSelectedFile(null);
        setPreview(null);
  
    } catch(error) {
        console.error("Error sending message:", error);
        toast({
            variant: "destructive",
            title: "Error Sending Message",
            description: "Could not send your message. Please try again."
        });
    } finally {
        setIsSending(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
        const file = event.target.files[0];
        setSelectedFile(file);

        const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
        let previewUrl = URL.createObjectURL(file);

        if (mediaType === 'video') {
            try {
                const thumbBlob = await captureVideoFrame(file, 'chat');
                if (thumbBlob) {
                   previewUrl = URL.createObjectURL(thumbBlob);
                }
            } catch (error) {
                console.error("Could not generate video thumbnail for chat.", error);
            }
        }
        setPreview({ url: previewUrl, type: mediaType });
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreview(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const totalIsLoading = isUploading || isSending;

  const isCurrentUserParticipant = chatRoom?.participantIds.includes(currentUser?.uid || '') ?? false;
  const partnerName = finalPartners.map(p => p.name).join(' & ');

  return (
    <div className="flex h-full flex-col">
       <div className="flex items-center gap-4 border-b p-4">
        {onBack && <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden"><ArrowLeft /></Button>}
        <div className="flex -space-x-2 rtl:space-x-reverse">
          {finalPartners.map(p => (
            <Avatar key={p.id} className="h-10 w-10 border">
              <AvatarImage src={p.photoURL} alt={p.name} />
              <AvatarFallback>{p.name?.charAt(0) || '?'}</AvatarFallback>
            </Avatar>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="font-semibold truncate">{partnerName}</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4" ref={viewportRef}>
            {messages.length === 0 && chatRoom ? (
                <div className="text-center text-muted-foreground pt-12">
                    No messages yet. Say hello!
                </div>
            ) : messages.map((msg, index) => {
              const sender = allUsersMap?.get(msg.senderId);

              // In admin view (allUsersMap exists), align based on participant index. In user view, align based on current user.
              const isParticipant = chatRoom?.participantIds.includes(currentUser?.uid || '') ?? false;
              let alignRight;
                if (!isParticipant) { // Admin view
                    alignRight = msg.senderId === chatRoom?.participantIds[1];
                } else { // Normal user view
                    alignRight = msg.senderId === currentUser?.uid;
                }

              const showAvatar = (index === 0 || messages[index - 1].senderId !== msg.senderId);
              const mediaUrl = msg.imageUrl || msg.videoUrl;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex items-end gap-2',
                    alignRight ? 'justify-end' : 'justify-start'
                  )}
                >
                   {!alignRight && (
                    <div className="w-8 shrink-0">
                      {showAvatar && (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={sender?.photoURL} />
                          <AvatarFallback>
                            {sender?.name?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-xs rounded-lg p-2 text-sm lg:max-w-md space-y-2',
                      alignRight
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    )}
                  >
                     {mediaUrl && msg.mediaName && (
                        <a 
                            href={mediaUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={cn(
                                "flex items-center gap-2 rounded-md p-2 transition-colors",
                                alignRight ? "hover:bg-primary/80" : "hover:bg-muted-foreground/10"
                            )}
                        >
                            {msg.mediaType === 'image' ? <FileImage className="h-5 w-5 shrink-0"/> : <FileVideo className="h-5 w-5 shrink-0"/>}
                            <span className="truncate text-sm font-medium">{msg.mediaName}</span>
                        </a>
                     )}
                    {msg.message && <p className="whitespace-pre-wrap break-words px-1">{msg.message}</p>}
                     <p className={cn("text-xs mt-1 text-right px-1", alignRight ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {msg.timestamp ? format(msg.timestamp.toDate(), 'p') : ''}
                    </p>
                  </div>
                   {alignRight && (
                    <div className="w-8 shrink-0">
                      {showAvatar && (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={sender?.photoURL} />
                          <AvatarFallback>
                            {sender?.name?.charAt(0) || currentUser?.displayName?.charAt(0) || '?'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
       <div className="border-t p-4">
        {preview && selectedFile && (
            <div className="mb-2 relative w-fit rounded-md border p-2 flex items-center gap-2">
                {preview.type === 'image' ? <FileImage className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                <span className="text-sm truncate">{selectedFile.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={removeFile} >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        )}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
           <Input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*,video/*"
              disabled={totalIsLoading}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={totalIsLoading || !!selectedFile}>
                <Paperclip />
            </Button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            autoComplete="off"
            disabled={!chatRoom || totalIsLoading || !isCurrentUserParticipant}
          />
          <Button type="submit" size="icon" disabled={(!newMessage.trim() && !selectedFile) || !chatRoom || totalIsLoading || !isCurrentUserParticipant}>
            {totalIsLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
};
