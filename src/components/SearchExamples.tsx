
import React from "react";
import { Button } from "@/components/ui/button";

interface SearchExampleProps {
  setQuery: (query: string) => void;
  handleSearch: () => void;
}

const SearchExamples: React.FC<SearchExampleProps> = ({ setQuery, handleSearch }) => {
  const examples = [
    {
      title: "Role + Industry",
      query: "I'm looking for founders in healthcare or biotech startups"
    },
    {
      title: "Role + Company",
      query: "Find alumni with product management experience at Google or Meta"
    },
    {
      title: "Role + Location",
      query: "Show me VCs and investors based in the Bay Area"
    },
    {
      title: "Skills",
      query: "Looking for alumni with machine learning and AI expertise"
    },
    {
      title: "Company",
      query: "Find people who worked at McKinsey or Bain"
    },
    {
      title: "Education + Industry",
      query: "Show me Stanford or MIT alumni working in fintech"
    }
  ];

  const handleExampleClick = (query: string) => {
    setQuery(query);
    handleSearch();
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {examples.map((example, index) => (
          <div key={index} className="rounded-lg bg-gray-50 p-4 border border-gray-200 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">{example.title}</p>
              <Button
                variant="outline"
                onClick={() => handleExampleClick(example.query)}
                className="h-7 px-2 text-xs border-gray-300 text-harvard-crimson"
              >
                Try this
              </Button>
            </div>
            <p className="text-sm text-gray-600 flex-grow">{example.query}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchExamples;
