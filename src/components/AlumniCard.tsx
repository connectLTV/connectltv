
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, Mail } from "lucide-react";
import { Alumni, generateIntroEmail } from "@/services/alumniService";
import { toast } from "sonner";

interface AlumniCardProps {
  alumni: Alumni;
  index: number;
}

const AlumniCard: React.FC<AlumniCardProps> = ({ alumni, index }) => {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailContent, setEmailContent] = useState("");

  const handleEmailClick = () => {
    const emailTemplate = generateIntroEmail(alumni);
    setEmailContent(emailTemplate);
    setEmailOpen(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(emailContent);
    toast.success("Email template copied to clipboard");
  };

  const initials = `${alumni.firstName.charAt(0)}${alumni.lastName.charAt(0)}`;

  return (
    <>
      <Card className="overflow-hidden transition-all hover:shadow-md">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <Avatar className="h-16 w-16 border">
                {alumni.imageUrl ? (
                  <AvatarImage src={alumni.imageUrl} alt={`${alumni.firstName} ${alumni.lastName}`} />
                ) : (
                  <AvatarFallback className="bg-brand-100 text-brand-800">{initials}</AvatarFallback>
                )}
              </Avatar>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-brand-800">
                  {alumni.firstName} {alumni.lastName}
                </h3>
                <span className="text-xs font-medium bg-brand-50 text-brand-600 py-1 px-2 rounded-full">
                  #{index + 1}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-700">
                {alumni.currentTitle} at {alumni.currentCompany}
              </p>
              <p className="text-sm text-gray-600 mt-2">{alumni.workExperience}</p>
              <div className="mt-3 p-2 rounded-lg bg-accent1/10 border border-accent1/20">
                <p className="text-sm">
                  <span className="font-medium text-accent1">Why relevant:</span> {alumni.relevanceReason}
                </p>
              </div>
              <p className="mt-3 text-sm text-gray-700">
                <span className="font-medium">Email:</span> {alumni.email}
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between bg-gray-50 px-6 py-3">
          <Button variant="outline" size="sm" onClick={handleEmailClick}>
            <Mail className="mr-2 h-4 w-4" /> Draft an intro email
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={alumni.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> LinkedIn
            </a>
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Template for {alumni.firstName} {alumni.lastName}</DialogTitle>
          </DialogHeader>
          <div className="bg-gray-50 p-4 rounded-md">
            <pre className="whitespace-pre-wrap text-sm font-mono">{emailContent}</pre>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
              Close
            </Button>
            <Button onClick={copyToClipboard}>
              Copy to Clipboard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AlumniCard;
