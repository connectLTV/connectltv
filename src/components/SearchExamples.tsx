
import React from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

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
    <div className="w-full max-w-2xl mx-auto mt-8">
      <h3 className="text-lg font-medium text-gray-700 mb-3">Try these examples:</h3>
      <div className="space-y-3">
        {examples.map((example, index) => (
          <div key={index} className="rounded-lg border p-4 hover:border-accent1 transition-colors">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium text-brand-800">{example.title}</h4>
                <p className="text-sm text-gray-600 mt-1">{example.query}</p>
              </div>
              <Button 
                variant="outline"
                size="sm" 
                onClick={() => handleExampleClick(example.query)} 
                className="ml-4 mt-1 border-accent1 text-accent1 hover:bg-accent1/10"
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
