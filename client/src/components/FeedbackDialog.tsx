import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Loader2 } from "lucide-react";
import axios from 'axios';

export function FeedbackDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!feedback.trim()) {
      toast({
        title: "Feedback Required",
        description: "Please enter your feedback before submitting",
        variant: "destructive",
      });
      return;
    }
    
    // Start loading state
    setIsSubmitting(true);
    
    try {
      console.log('Submitting feedback to server...');
      
      // Determine the appropriate server URL based on the current environment
      let serverUrl;
      const hostname = window.location.hostname;
      
      if (hostname === 'localhost') {
        // Local development environment
        serverUrl = 'http://localhost:3001';
      } else if (hostname === 'fishcad.com') {
        // Production environment
        serverUrl = 'https://fishcad.com';
      } else {
        // Default fallback
        serverUrl = window.location.origin;
      }
        
      const apiUrl = `${serverUrl}/api/submit-feedback`;
      console.log('Using API URL:', apiUrl);
      
      // Log additional debugging information
      console.log('Current hostname:', hostname);
      console.log('Current origin:', window.location.origin);
      
      // Add a simple fallback in case the server API call fails
      let useMailtoFallback = false;
      
      try {
        // Try to send via server API first
        const response = await axios.post(apiUrl, {
          name,
          email,
          feedback
        }, {
          headers: {
            'Content-Type': 'application/json'
          },
          withCredentials: false,
          timeout: 10000 // Increase timeout to 10 seconds
        });
        
        console.log('Server response:', response);
        
        if (response.status === 200) {
          // Show success message with details from the server response
          const emailSent = response.data.emailSent === true;
          
          toast({
            title: "Feedback Submitted",
            description: emailSent 
              ? "Thank you for your feedback! We've received your message via email."
              : "Thank you for your feedback! We've received your message, but there might have been an issue sending the email confirmation.",
          });
          
          // Close the dialog and reset form
          setIsOpen(false);
          setName('');
          setEmail('');
          setFeedback('');
        } else {
          // Show error message if status is not 200
          throw new Error(`Server responded with status ${response.status}: ${response.data?.error || 'Unknown error'}`);
        }
      } catch (apiError: any) {
        console.error('API error:', apiError);
        
        // If server is unavailable on port 3001, try port 3002
        if (serverUrl === 'http://localhost:3001' && apiError.code === 'ERR_NETWORK') {
          try {
            console.log('Trying alternate port 3002...');
            
            const alternateServerUrl = 'http://localhost:3002';
            const alternateApiUrl = `${alternateServerUrl}/api/submit-feedback`;
            
            const retryResponse = await axios.post(alternateApiUrl, {
              name,
              email,
              feedback
            }, {
              headers: {
                'Content-Type': 'application/json'
              },
              withCredentials: false,
              timeout: 10000
            });
            
            if (retryResponse.status === 200) {
              const emailSent = retryResponse.data.emailSent === true;
              
              toast({
                title: "Feedback Submitted",
                description: emailSent 
                  ? "Thank you for your feedback! We've received your message via email."
                  : "Thank you for your feedback! We've received your message, but there might have been an issue sending the email confirmation.",
              });
              
              // Close the dialog and reset form
              setIsOpen(false);
              setName('');
              setEmail('');
              setFeedback('');
              
              // Exit early - no need for mailto fallback
              return;
            }
          } catch (retryError) {
            console.error('Retry on alternate port failed:', retryError);
          }
        }
        
        // Extract detailed error message if available
        let errorMessage = 'Could not send feedback to the server. Falling back to email client.';
        let errorDetails = '';
        
        if (apiError.response?.data?.error) {
          errorMessage = `Server error: ${apiError.response.data.error}`;
          if (apiError.response.data.details) {
            errorDetails = apiError.response.data.details;
          }
        } else if (apiError.code === 'ERR_NETWORK') {
          if (window.location.hostname === 'fishcad.com') {
            errorMessage = 'Cannot connect to feedback server on fishcad.com.';
            errorDetails = 'This could be because the server component is not properly deployed or configured.';
          } else {
            errorMessage = 'Cannot connect to feedback server.';
            errorDetails = 'The server might be down or not running on the expected port.';
          }
        } else if (apiError.message?.includes('Network Error') || apiError.message?.includes('CORS')) {
          errorMessage = 'CORS error: Cannot communicate with the server due to browser security restrictions.';
          errorDetails = 'This is usually caused by a server configuration issue. Falling back to email client.';
          console.error('CORS or Network Error:', apiError);
        }
        
        console.error('Error details:', errorDetails);
        
        toast({
          title: "Server Communication Error",
          description: errorMessage,
          variant: "destructive",
        });
        
        // Fall back to mailto if server API fails
        useMailtoFallback = true;
      }
      
      // If server API failed, use mailto as fallback
      if (useMailtoFallback) {
        console.log('Falling back to mailto link...');
        
        // Create a mailto link as fallback
        const subject = `Feedback for Taiyaki from ${window.location.hostname}`;
        const body = `Source: ${window.location.hostname}
Name: ${name || 'Not provided'}
Email: ${email || 'Not provided'}

Feedback:
${feedback}`;
        const mailtoUrl = `mailto:taiyaki.orders@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        // Open the mailto link
        window.open(mailtoUrl, '_blank');
        
        toast({
          title: "Email Client Opened",
          description: "Your email client has been opened with the feedback pre-filled.",
        });
        
        // Close the dialog and reset form
        setIsOpen(false);
        setName('');
        setEmail('');
        setFeedback('');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "There was a problem submitting your feedback. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="gap-1"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Feedback</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            We value your input! Share your thoughts, suggestions, or report issues.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email (optional)"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="feedback" className="text-right">
                Feedback
              </Label>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What would you like to share with us?"
                className="col-span-3"
                rows={5}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Feedback"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 