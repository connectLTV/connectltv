
import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Alumni, searchAlumni } from "@/services/alumniService";
import AlumniCard from "@/components/AlumniCard";

const ResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("query") || "";
  const [results, setResults] = useState<Alumni[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResults = async () => {
      if (!query) return;
      
      setLoading(true);
      try {
        const data = await searchAlumni(query);
        setResults(data);
      } catch (error) {
        console.error("Error fetching results:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Button variant="outline" asChild className="mb-4">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Search
            </Link>
          </Button>
          
          <h1 className="text-2xl font-bold text-brand-800">Results for</h1>
          <p className="text-lg mt-1 font-medium text-gray-800 italic">"{query}"</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-t-accent1 border-r-accent1 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-medium text-gray-600 mt-4">Finding the perfect alumni matches...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {results.map((alumni, index) => (
              <AlumniCard key={alumni.id} alumni={alumni} index={index} />
            ))}
            {results.length === 0 && !loading && (
              <div className="text-center py-12">
                <h3 className="text-xl font-medium text-gray-700">No alumni found</h3>
                <p className="text-gray-500 mt-2">Try a different search query</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsPage;
