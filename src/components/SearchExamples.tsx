
import React from "react";
import { Button } from "@/components/ui/button";

interface SearchExampleProps {
  setQuery: (query: string) => void;
  handleSearch: () => void;
}

const SearchExamples: React.FC<SearchExampleProps> = ({ setQuery, handleSearch }) => {
  const examples = [
    {
      title: "Career guidance",
      query: "Debating between joining or founding a startup after HBS. Seeking insights from alumni 8-10 years out on both paths."
    },
    {
      title: "Seeking expertise",
      query: "Need insights on early-stage enterprise SaaS for construction, focusing on workflow automation. Looking for experts in operations and workflow management."
    },
    {
      title: "Building partnership",
      query: "Looking for senior leaders in restaurant finance for partnerships on an invoice automation startup."
    }
  ];

  const handleExampleClick = (query: string) => {
    setQuery(query);
    handleSearch();
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      <h3 className="text-base font-medium text-white mb-3 drop-shadow-md">Try these examples:</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {examples.map((example, index) => (
          <div key={index} className="rounded-lg backdrop-blur-sm bg-white/20 p-4 transition-all hover:bg-white/30 border border-white/30">
            <div className="flex flex-col h-full">
              <h4 className="font-medium text-white">{example.title}</h4>
              <p className="text-xs text-white/90 mt-1 flex-grow">{example.query}</p>
              <Button 
                variant="outline"
                size="sm" 
                onClick={() => handleExampleClick(example.query)} 
                className="mt-3 border-white/70 text-white hover:bg-white/20 self-end"
              >
                Try this
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchExamples;
