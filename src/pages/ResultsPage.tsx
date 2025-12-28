
import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Alumni, searchAlumni } from "@/services/alumniService";
import AlumniCard from "@/components/AlumniCard";
import AlumniProfile from "@/components/AlumniProfile";
import PromptingGuide from "@/components/PromptingGuide";

const PAGE_SIZE = 10;

const ResultsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("query") || "";
  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<Alumni[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlumni, setSelectedAlumni] = useState<Alumni | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Filter states
  const [filters, setFilters] = useState({
    graduationYear: "any",
    location: "any",
    instructor: "any",
    industry: "any",
    function: "any"
  });

  // Derive unique values for filter dropdowns (trimmed and sorted ascending)
  const uniqueYears = [...new Set(results.map(alumni => alumni.classYear?.trim()).filter(Boolean))].sort();
  const uniqueLocations = [...new Set(results.map(alumni => alumni.location?.trim()).filter(Boolean))].sort();
  const uniqueInstructors = [...new Set(results.map(alumni => alumni.instructor?.trim()).filter(Boolean))].sort();
  const uniqueIndustries = [...new Set(results.map(alumni => alumni.industry?.trim()).filter(Boolean))].sort();
  const uniqueFunctions = [...new Set(results.map(alumni => alumni.function?.trim()).filter(Boolean))].sort();

  // Apply filters to results (compare trimmed values)
  const filteredResults = results.filter(alumni => {
    return (
      (filters.graduationYear === "any" || alumni.classYear?.trim() === filters.graduationYear) &&
      (filters.location === "any" || alumni.location?.trim() === filters.location) &&
      (filters.instructor === "any" || alumni.instructor?.trim() === filters.instructor) &&
      (filters.industry === "any" || alumni.industry?.trim() === filters.industry) &&
      (filters.function === "any" || alumni.function?.trim() === filters.function)
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / PAGE_SIZE);
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Perform search when query changes
  useEffect(() => {
    const fetchResults = async () => {
      if (!query) return;
      
      setLoading(true);
      try {
        const data = await searchAlumni(query);
        console.log("Search results:", data);
        setResults(data);
        setCurrentPage(1); // Reset to first page on new search
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

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setSearchParams({ query: searchQuery });
      // Reset selected alumni when performing a new search
      setSelectedAlumni(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header with back button */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Search
              </Link>
            </Button>
            <PromptingGuide />
          </div>
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Results for</h1>
              <p className="text-lg mt-1 font-medium text-gray-800 italic">"{query}"</p>
            </div>
            
            <div className="flex w-full md:w-auto">
              <div className="relative flex-grow">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Try a new semantic search..."
                  className="pr-10"
                />
                <button 
                  onClick={handleSearch}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-harvard-crimson"
                >
                  <Search size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Horizontal filter bar - Post-search filtering on returned results */}
        {results.length > 0 && (
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
                    {uniqueIndustries.map((industry) => (
                      industry && <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                    ))}
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
                    {uniqueFunctions.map((functionVal) => (
                      functionVal && <SelectItem key={functionVal} value={functionVal}>{functionVal}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button variant="outline" size="sm" onClick={resetFilters} className="ml-auto hover:text-white hover:bg-harvard-crimson">
                Reset Filters
              </Button>
            </div>
          </div>
        )}

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
                <>
                  {/* Results count and page info */}
                  <div className="text-sm text-gray-500 mb-2">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, filteredResults.length)} of {filteredResults.length} results
                  </div>

                  {paginatedResults.map((alumni, index) => (
                    <div
                      key={alumni.id}
                      onClick={() => handleAlumniSelect(alumni)}
                      className={`cursor-pointer transition-all ${selectedAlumni?.id === alumni.id ? 'ring-2 ring-harvard-crimson' : ''}`}
                    >
                      <AlumniCard
                        alumni={alumni}
                        index={(currentPage - 1) * PAGE_SIZE + index}
                        isCompact={!!selectedAlumni}
                      />
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                          <Button
                            key={page}
                            variant={page === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className={`w-8 h-8 p-0 ${page === currentPage ? 'bg-harvard-crimson hover:bg-harvard-crimson-light' : ''}`}
                          >
                            {page}
                          </Button>
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
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
