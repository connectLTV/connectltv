
import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search } from "lucide-react";
import { Alumni, searchAlumni } from "@/services/alumniService";
import AlumniCard from "@/components/AlumniCard";
import AlumniProfile from "@/components/AlumniProfile";

const ResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("query") || "";
  const [results, setResults] = useState<Alumni[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlumni, setSelectedAlumni] = useState<Alumni | null>(null);

  // Filter states
  const [filters, setFilters] = useState({
    graduationYear: "any",
    location: "any",
    instructor: "any",
    industry: "any",
    function: "any"
  });

  // Derive unique values for filter dropdowns
  const uniqueYears = [...new Set(results.map(alumni => alumni.classYear).filter(Boolean))];
  const uniqueLocations = [...new Set(results.map(alumni => alumni.location).filter(Boolean))];
  const uniqueInstructors = [...new Set(results.map(alumni => alumni.instructor).filter(Boolean))];

  // Apply filters to results
  const filteredResults = results.filter(alumni => {
    return (
      (filters.graduationYear === "any" || alumni.classYear === filters.graduationYear) &&
      (filters.location === "any" || alumni.location === filters.location) &&
      (filters.instructor === "any" || alumni.instructor === filters.instructor)
      // Industry and function filters would be applied similarly if available in the data
    );
  });

  useEffect(() => {
    const fetchResults = async () => {
      if (!query) return;
      
      setLoading(true);
      try {
        const data = await searchAlumni(query);
        console.log("Search results:", data);
        setResults(data);
      } catch (error) {
        console.error("Error fetching results:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query]);

  const resetFilters = () => {
    setFilters({
      graduationYear: "any",
      location: "any",
      instructor: "any",
      industry: "any",
      function: "any"
    });
  };

  const handleAlumniSelect = (alumni: Alumni) => {
    setSelectedAlumni(alumni === selectedAlumni ? null : alumni);
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header with back button */}
        <div className="mb-6">
          <Button variant="outline" asChild className="mb-4">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Search
            </Link>
          </Button>
          
          <h1 className="text-2xl font-bold text-gray-800">Results for</h1>
          <p className="text-lg mt-1 font-medium text-gray-800 italic">"{query}"</p>
        </div>
        
        {/* Horizontal filter bar */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-grow-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Filters:</label>
            </div>
            
            <div className="w-40">
              <Select value={filters.graduationYear} onValueChange={(value) => setFilters({...filters, graduationYear: value})}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Any Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Year</SelectItem>
                  {uniqueYears.map((year) => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-40">
              <Select value={filters.location} onValueChange={(value) => setFilters({...filters, location: value})}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Any Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Location</SelectItem>
                  {uniqueLocations.map((location) => (
                    <SelectItem key={location} value={location}>{location}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-40">
              <Select value={filters.instructor} onValueChange={(value) => setFilters({...filters, instructor: value})}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Any Instructor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Instructor</SelectItem>
                  {uniqueInstructors.map((instructor) => (
                    <SelectItem key={instructor} value={instructor}>{instructor}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-40">
              <Select value={filters.industry} onValueChange={(value) => setFilters({...filters, industry: value})}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Any Industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Industry</SelectItem>
                  {/* Add industry options when available in data */}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-40">
              <Select value={filters.function} onValueChange={(value) => setFilters({...filters, function: value})}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Any Function" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Function</SelectItem>
                  {/* Add function options when available in data */}
                </SelectContent>
              </Select>
            </div>
            
            <Button variant="outline" size="sm" onClick={resetFilters} className="ml-auto">
              Reset Filters
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-t-harvard-crimson border-r-harvard-crimson border-b-transparent border-l-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-medium text-gray-600 mt-4">Finding the perfect alumni matches...</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Results Column - Always full width when no profile is selected */}
            <div className={`space-y-4 ${selectedAlumni ? 'md:w-1/2' : 'w-full'}`}>
              {filteredResults.length === 0 ? (
                <div className="text-center py-12">
                  <h3 className="text-xl font-medium text-gray-700">No alumni found</h3>
                  <p className="text-gray-500 mt-2">Try a different search query or adjust your filters</p>
                </div>
              ) : (
                filteredResults.map((alumni, index) => (
                  <div 
                    key={alumni.id} 
                    onClick={() => handleAlumniSelect(alumni)}
                    className={`cursor-pointer transition-all ${selectedAlumni?.id === alumni.id ? 'ring-2 ring-harvard-crimson' : ''}`}
                  >
                    <AlumniCard 
                      alumni={alumni} 
                      index={index} 
                      isCompact={!!selectedAlumni} 
                    />
                  </div>
                ))
              )}
            </div>
            
            {/* Profile View - Only shown when an alumni is selected */}
            {selectedAlumni && (
              <div className="md:w-1/2 sticky top-4">
                <div className="bg-white rounded-lg shadow-lg p-6 border">
                  <AlumniProfile alumni={selectedAlumni} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsPage;
