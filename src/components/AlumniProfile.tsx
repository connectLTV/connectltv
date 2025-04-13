
import React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, Mail, Briefcase, MapPin, GraduationCap } from "lucide-react";
import { Alumni, generateIntroEmail } from "@/services/alumniService";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AlumniProfileProps {
  alumni: Alumni;
}

const AlumniProfile: React.FC<AlumniProfileProps> = ({ alumni }) => {
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [emailContent, setEmailContent] = React.useState("");

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
      <div className="flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <Avatar className="h-24 w-24 border-2 border-gray-200">
            {alumni.imageUrl ? (
              <AvatarImage src={alumni.imageUrl} alt={`${alumni.firstName} ${alumni.lastName}`} />
            ) : (
              <AvatarFallback className="bg-red-100 text-red-800 text-xl">{initials}</AvatarFallback>
            )}
          </Avatar>
          <div>
            <h2 className="text-2xl font-bold text-brand-800">
              {alumni.firstName} {alumni.lastName}
            </h2>
            <p className="text-lg text-gray-700">
              {alumni.currentTitle} at {alumni.currentCompany}
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-2">
            <Briefcase className="h-5 w-5 text-gray-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-gray-800">Work Experience</h3>
              <p className="text-gray-600">{alumni.workExperience}</p>
            </div>
          </div>
          
          {alumni.location && (
            <div className="flex items-start gap-2">
              <MapPin className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h3 className="font-medium text-gray-800">Location</h3>
                <p className="text-gray-600">{alumni.location}</p>
              </div>
            </div>
          )}
          
          {alumni.classYear && (
            <div className="flex items-start gap-2">
              <GraduationCap className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h3 className="font-medium text-gray-800">HBS Class Year</h3>
                <p className="text-gray-600">{alumni.classYear}</p>
              </div>
            </div>
          )}
          
          {alumni.instructor && (
            <div className="flex items-start gap-2">
              <GraduationCap className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <h3 className="font-medium text-gray-800">LTV Instructor</h3>
                <p className="text-gray-600">{alumni.instructor}</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-red-50 rounded-lg border border-red-100 mb-6">
          <h3 className="font-semibold text-red-800 mb-2">Why This Alumni Is Relevant</h3>
          <p className="text-gray-700">{alumni.relevanceReason}</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleEmailClick} className="flex-1">
            <Mail className="mr-2 h-4 w-4" /> Draft Intro Email
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <a href={alumni.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> View LinkedIn Profile
            </a>
          </Button>
        </div>
      </div>

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
              <ExternalLink className="h-4 w-4" /> Copy to Clipboard
            </Button>
            <Button onClick={openInMailApp} className="bg-red-800 hover:bg-red-900 flex items-center gap-2">
              <Mail className="h-4 w-4" /> Open in Mail App
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AlumniProfile;
