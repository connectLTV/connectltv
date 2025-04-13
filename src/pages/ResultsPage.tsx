
import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Filter, X } from "lucide-react";
import { Alumni, searchAlumni } from "@/services/alumniService";
import AlumniCard from "@/components/AlumniCard";
import AlumniProfile from "@/components/AlumniProfile";

const ResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("query") || "";
  const [results, setResults] = useState<Alumni[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlumni, setSelectedAlumni] = useState<Alumni | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    graduationYear: "",
    location: "",
    instructor: "",
    industry: "",
    function: ""
  });

  // Derive unique values for filter dropdowns
  const uniqueYears = [...new Set(results.map(alumni => alumni.classYear).filter(Boolean))];
  const uniqueLocations = [...new Set(results.map(alumni => alumni.location).filter(Boolean))];
  const uniqueInstructors = [...new Set(results.map(alumni => alumni.instructor).filter(Boolean))];

  // Apply filters to results
  const filteredResults = results.filter(alumni => {
    return (
      (filters.graduationYear === "" || alumni.classYear === filters.graduationYear) &&
      (filters.location === "" || alumni.location === filters.location) &&
      (filters.instructor === "" || alumni.instructor === filters.instructor)
      // Industry and function filters would be applied similarly if available in the data
    );
  });

  useEffect(() => {
    const fetchResults = async () => {
      if (!query) return;
      
      setLoading(true);
      try {
        const data = await searchAlumni(query);
        setResults(data);
        if (data.length > 0) {
          setSelectedAlumni(data[0]);
        }
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
      graduationYear: "",
      location: "",
      instructor: "",
      industry: "",
      function: ""
    });
  };

  const handleAlumniSelect = (alumni: Alumni) => {
    setSelectedAlumni(alumni);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <Button variant="outline" asChild className="mb-4">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Search
              </Link>
            </Button>
            
            <h1 className="text-2xl font-bold text-brand-800">Results for</h1>
            <p className="text-lg mt-1 font-medium text-gray-800 italic">"{query}"</p>
          </div>
          
          <Button 
            variant="outline" 
            onClick={() => setFiltersVisible(!filtersVisible)}
            className="flex items-center gap-2"
          >
            <Filter size={16} />
            {filtersVisible ? "Hide Filters" : "Show Filters"}
          </Button>
        </div>

        {/* Filters */}
        {filtersVisible && (
          <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium text-gray-800">Filter Results</h2>
              <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Graduation Year</label>
                <Select value={filters.graduationYear} onValueChange={(value) => setFilters({...filters, graduationYear: value})}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any Year</SelectItem>
                    {uniqueYears.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <Select value={filters.location} onValueChange={(value) => setFilters({...filters, location: value})}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any Location</SelectItem>
                    {uniqueLocations.map((location) => (
                      <SelectItem key={location} value={location}>{location}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LTV Instructor</label>
                <Select value={filters.instructor} onValueChange={(value) => setFilters({...filters, instructor: value})}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any Instructor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any Instructor</SelectItem>
                    {uniqueInstructors.map((instructor) => (
                      <SelectItem key={instructor} value={instructor}>{instructor}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                <Select value={filters.industry} onValueChange={(value) => setFilters({...filters, industry: value})}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any Industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any Industry</SelectItem>
                    {/* Add industry options when available in data */}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Function</label>
                <Select value={filters.function} onValueChange={(value) => setFilters({...filters, function: value})}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any Function" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any Function</SelectItem>
                    {/* Add function options when available in data */}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-t-red-800 border-r-red-800 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-medium text-gray-600 mt-4">Finding the perfect alumni matches...</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            {/* Results Column */}
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
                    className={`cursor-pointer transition-all ${selectedAlumni?.id === alumni.id ? 'ring-2 ring-red-800' : ''}`}
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
            
            {/* Profile View */}
            {selectedAlumni && (
              <div className="md:w-1/2 sticky top-4">
                <div className="bg-white rounded-lg shadow-lg p-6 border">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-bold text-brand-800">Alumni Profile</h2>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="md:hidden" 
                      onClick={() => setSelectedAlumni(null)}
                    >
                      <X size={18} />
                    </Button>
                  </div>
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
