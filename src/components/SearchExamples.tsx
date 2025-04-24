
import React from "react";
import { Button } from "@/components/ui/button";

interface SearchExampleProps {
  setQuery: (query: string) => void;
  handleSearch: () => void;
}

const SearchExamples: React.FC<SearchExampleProps> = ({ setQuery, handleSearch }) => {
  const examples = [
    {
      title: "Natural language search",
      query: "Looking for founders in AI startups based in Boston who graduated after 2020"
    },
    {
      title: "Seeking expertise",
      query: "Need insights from product leaders who have experience with healthcare technology"
    },
    {
      title: "Career guidance",
      query: "Connect me with senior executives in fintech who can advise on career transitions"
    }
  ];

  const handleExampleClick = (query: string) => {
    setQuery(query);
    handleSearch();
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      <h3 className="text-base font-medium text-gray-700 mb-3">Try these semantic searches:</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {examples.map((example, index) => (
          <div key={index} className="rounded-lg bg-gray-50 p-4 border border-gray-200">
            <div className="flex flex-col h-full">
              <h4 className="font-medium text-gray-800">{example.title}</h4>
              <p className="text-xs text-gray-600 mt-1 flex-grow">{example.query}</p>
              <Button 
                variant="outline"
                size="sm" 
                onClick={() => handleExampleClick(example.query)} 
                className="mt-3 border-gray-300 text-harvard-crimson hover:text-white hover:bg-harvard-crimson self-end"
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
