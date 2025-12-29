
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, Mail, Copy, Send } from "lucide-react";
import { Alumni, generateIntroEmail } from "@/services/alumniService";
import { toast } from "sonner";

interface AlumniCardProps {
  alumni: Alumni;
  index: number;
  isCompact?: boolean;
}

const AlumniCard: React.FC<AlumniCardProps> = ({ alumni, index, isCompact = false }) => {
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

  const openInMailApp = () => {
    const subject = encodeURIComponent("Harvard Business School LTV Connection");
    const body = encodeURIComponent(emailContent);
    window.location.href = `mailto:${alumni.email}?subject=${subject}&body=${body}`;
    toast.success("Opening in mail application");
  };

  const initials = `${alumni.firstName.charAt(0)}${alumni.lastName.charAt(0)}`;

  return (
    <>
      <Card className={`overflow-hidden transition-all hover:shadow-md ${isCompact ? 'p-2' : 'p-0'}`}>
        <CardContent className={isCompact ? "p-2" : "p-6"}>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <Avatar className={isCompact ? "h-12 w-12" : "h-16 w-16"}>
                {alumni.imageUrl ? (
                  <AvatarImage src={alumni.imageUrl} alt={`${alumni.firstName} ${alumni.lastName}`} />
                ) : (
                  <AvatarFallback className="bg-red-100 text-red-800">{initials}</AvatarFallback>
                )}
              </Avatar>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className={`${isCompact ? 'text-base' : 'text-lg'} font-medium text-brand-800`}>
                  {alumni.firstName} {alumni.lastName}
                </h3>
                <span className="text-xs font-medium bg-red-50 text-red-700 py-1 px-2 rounded-full">
                  #{index + 1}
                </span>
              </div>
              <p className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-gray-700`}>
                {alumni.headline}
              </p>
              {!isCompact && (
                <>
                  {alumni.experience_summary && (
                    <p className="text-sm text-gray-600 mt-2">
                      <span className="font-medium">Experience:</span> {alumni.experience_summary}
                    </p>
                  )}
                  {alumni.education_summary && (
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium">Education:</span> {alumni.education_summary}
                    </p>
                  )}
                  <div className="mt-3 p-2 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-sm">
                      <span className="font-medium text-red-800">Why relevant:</span> {alumni.relevanceReason}
                    </p>
                  </div>
                </>
              )}
              <p className={`${isCompact ? 'mt-1 text-xs' : 'mt-3 text-sm'} text-gray-700`}>
                <span className="font-medium">Email:</span> {alumni.email}
              </p>
              {alumni.classYear && (
                <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600`}>
                  <span className="font-medium">Class:</span> {alumni.classYear}
                </p>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className={`flex justify-between bg-gray-50 ${isCompact ? 'px-2 py-2' : 'px-6 py-3'}`}>
          <Button variant="outline" size={isCompact ? "sm" : "default"} onClick={handleEmailClick}>
            <Mail className={`${isCompact ? 'h-3 w-3' : 'h-4 w-4'} mr-2`} /> Draft Email
          </Button>
          <Button variant="outline" size={isCompact ? "sm" : "default"} asChild>
            <a href={alumni.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className={`${isCompact ? 'h-3 w-3' : 'h-4 w-4'} mr-2`} /> LinkedIn
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
            <Button onClick={copyToClipboard} className="flex items-center gap-2">
              <Copy className="h-4 w-4" /> Copy to Clipboard
            </Button>
            <Button onClick={openInMailApp} className="bg-red-800 hover:bg-red-900 flex items-center gap-2">
              <Send className="h-4 w-4" /> Open in Mail App
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AlumniCard;
