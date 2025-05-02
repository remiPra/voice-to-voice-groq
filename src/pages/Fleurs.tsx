import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// Définition du type pour un événement
interface FlowerEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  url: string;
  color: string;
  textColor: string;
  className: string;
  allDay: boolean;
  description: string;
  location: string;
}

// Extraction du code postal et de la ville depuis la description
const extractLocationInfo = (description: string): { postalCode: string; city: string } => {
  const regex = /(\d{5})\s+([^<]+)/;
  const match = description.match(regex);
  
  if (match && match.length >= 3) {
    return {
      postalCode: match[1],
      city: match[2].trim()
    };
  }
  
  return { postalCode: '', city: '' };
};

// Fonction pour obtenir la région à partir du code postal
const getRegionFromPostalCode = (postalCode: string): string => {
  const prefix = postalCode.substring(0, 2);
  
  // Mapping simplifié des préfixes de code postal aux régions
  const regionMap: Record<string, string> = {
    '01': 'Auvergne-Rhône-Alpes',
    '03': 'Auvergne-Rhône-Alpes',
    '07': 'Auvergne-Rhône-Alpes',
    '15': 'Auvergne-Rhône-Alpes',
    '26': 'Auvergne-Rhône-Alpes',
    '38': 'Auvergne-Rhône-Alpes',
    '42': 'Auvergne-Rhône-Alpes',
    '43': 'Auvergne-Rhône-Alpes',
    '63': 'Auvergne-Rhône-Alpes',
    '69': 'Auvergne-Rhône-Alpes',
    '73': 'Auvergne-Rhône-Alpes',
    '74': 'Auvergne-Rhône-Alpes',
    '21': 'Bourgogne-Franche-Comté',
    '25': 'Bourgogne-Franche-Comté',
    '39': 'Bourgogne-Franche-Comté',
    '58': 'Bourgogne-Franche-Comté',
    '70': 'Bourgogne-Franche-Comté',
    '71': 'Bourgogne-Franche-Comté',
    '89': 'Bourgogne-Franche-Comté',
    '90': 'Bourgogne-Franche-Comté',
    '22': 'Bretagne',
    '29': 'Bretagne',
    '35': 'Bretagne',
    '56': 'Bretagne',
    '18': 'Centre-Val de Loire',
    '28': 'Centre-Val de Loire',
    '36': 'Centre-Val de Loire',
    '37': 'Centre-Val de Loire',
    '41': 'Centre-Val de Loire',
    '45': 'Centre-Val de Loire',
    '2A': 'Corse',
    '2B': 'Corse',
    '08': 'Grand Est',
    '10': 'Grand Est',
    '51': 'Grand Est',
    '52': 'Grand Est',
    '54': 'Grand Est',
    '55': 'Grand Est',
    '57': 'Grand Est',
    '67': 'Grand Est',
    '68': 'Grand Est',
    '88': 'Grand Est',
    '02': 'Hauts-de-France',
    '59': 'Hauts-de-France',
    '60': 'Hauts-de-France',
    '62': 'Hauts-de-France',
    '80': 'Hauts-de-France',
    '75': 'Île-de-France',
    '77': 'Île-de-France',
    '78': 'Île-de-France',
    '91': 'Île-de-France',
    '92': 'Île-de-France',
    '93': 'Île-de-France',
    '94': 'Île-de-France',
    '95': 'Île-de-France',
    '14': 'Normandie',
    '27': 'Normandie',
    '50': 'Normandie',
    '61': 'Normandie',
    '76': 'Normandie',
    '16': 'Nouvelle-Aquitaine',
    '17': 'Nouvelle-Aquitaine',
    '19': 'Nouvelle-Aquitaine',
    '23': 'Nouvelle-Aquitaine',
    '24': 'Nouvelle-Aquitaine',
    '33': 'Nouvelle-Aquitaine',
    '40': 'Nouvelle-Aquitaine',
    '47': 'Nouvelle-Aquitaine',
    '64': 'Nouvelle-Aquitaine',
    '79': 'Nouvelle-Aquitaine',
    '86': 'Nouvelle-Aquitaine',
    '87': 'Nouvelle-Aquitaine',
    '09': 'Occitanie',
    '11': 'Occitanie',
    '12': 'Occitanie',
    '30': 'Occitanie',
    '31': 'Occitanie',
    '32': 'Occitanie',
    '34': 'Occitanie',
    '46': 'Occitanie',
    '48': 'Occitanie',
    '65': 'Occitanie',
    '66': 'Occitanie',
    '81': 'Occitanie',
    '82': 'Occitanie',
    '44': 'Pays de la Loire',
    '49': 'Pays de la Loire',
    '53': 'Pays de la Loire',
    '72': 'Pays de la Loire',
    '85': 'Pays de la Loire',
    '04': 'Provence-Alpes-Côte d\'Azur',
    '05': 'Provence-Alpes-Côte d\'Azur',
    '06': 'Provence-Alpes-Côte d\'Azur',
    '13': 'Provence-Alpes-Côte d\'Azur',
    '83': 'Provence-Alpes-Côte d\'Azur',
    '84': 'Provence-Alpes-Côte d\'Azur',
  };
  
  return regionMap[prefix] || 'Autre';
};

const EventFlower: React.FC = () => {
  const [events, setEvents] = useState<FlowerEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<FlowerEvent[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth());
  const [monthEvents, setMonthEvents] = useState<FlowerEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Charger les données depuis le fichier JSON
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const response = await fetch('/fleurs.json');
        if (!response.ok) {
          throw new Error('Erreur lors du chargement des données');
        }
        const data = await response.json();
        setEvents(data);
        setFilteredEvents(data);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        setLoading(false);
      }
    };
    
    fetchEvents();
  }, []);
  
  // Extraction de toutes les régions disponibles
  const allRegions = React.useMemo(() => {
    const regions = new Set<string>();
    
    events.forEach(event => {
      const { postalCode } = extractLocationInfo(event.description);
      if (postalCode) {
        const region = getRegionFromPostalCode(postalCode);
        regions.add(region);
      }
    });
    
    return Array.from(regions).sort();
  }, [events]);
  
  // Effet pour filtrer les événements par région
  useEffect(() => {
    if (selectedRegion) {
      const filtered = events.filter(event => {
        const { postalCode } = extractLocationInfo(event.description);
        return getRegionFromPostalCode(postalCode) === selectedRegion;
      });
      setFilteredEvents(filtered);
      
      // Extraction des départements de la région sélectionnée
      const deps = new Set<string>();
      filtered.forEach(event => {
        const { postalCode } = extractLocationInfo(event.description);
        if (postalCode) {
          deps.add(postalCode.substring(0, 2));
        }
      });
      setDepartments(Array.from(deps).sort());
      setSelectedDepartment('');
    } else {
      setFilteredEvents(events);
      setDepartments([]);
      setSelectedDepartment('');
    }
  }, [selectedRegion, events]);
  
  // Effet pour filtrer par département
  useEffect(() => {
    if (selectedDepartment) {
      const filtered = events.filter(event => {
        const { postalCode } = extractLocationInfo(event.description);
        return postalCode.startsWith(selectedDepartment);
      });
      setFilteredEvents(filtered);
    } else if (selectedRegion) {
      const filtered = events.filter(event => {
        const { postalCode } = extractLocationInfo(event.description);
        return getRegionFromPostalCode(postalCode) === selectedRegion;
      });
      setFilteredEvents(filtered);
    } else {
      setFilteredEvents(events);
    }
  }, [selectedDepartment, selectedRegion, events]);
  
  // Effet pour filtrer les événements du mois courant
  useEffect(() => {
    const filtered = filteredEvents.filter(event => {
      const eventDate = parseISO(event.start);
      return eventDate.getMonth() === currentMonth;
    });
    
    // Trier par date de début
    filtered.sort((a, b) => {
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });
    
    setMonthEvents(filtered);
  }, [filteredEvents, currentMonth]);
  
  // Mois en français
  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-500"></div>
        <span className="ml-3 text-xl font-medium text-green-600">Chargement...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-3xl mx-auto mt-10" role="alert">
        <strong className="font-bold">Erreur!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }
  
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8 text-green-800">Fêtes des Plantes et Événements Horticoles</h1>
      
      {/* Filtres */}
      <div className="bg-green-50 p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold mb-4 text-green-700">Filtrer les événements</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
            >
              <option value="">Toutes les régions</option>
              {allRegions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Département</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              disabled={!selectedRegion}
            >
              <option value="">Tous les départements</option>
              {departments.map(dep => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
            >
              {months.map((month, index) => (
                <option key={index} value={index}>{month}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Statistiques */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-8">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <h2 className="text-xl font-semibold text-green-700 mb-2 md:mb-0">
            {months[currentMonth]} 2025
          </h2>
          <div className="flex items-center">
            <span className="inline-flex items-center justify-center px-3 py-1 mr-2 text-xs font-bold leading-none text-white bg-green-600 rounded-full">
              {monthEvents.length}
            </span>
            <p className="text-gray-600">
              événement{monthEvents.length > 1 ? 's' : ''} trouvé{monthEvents.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>
      
      {/* Liste des événements */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {monthEvents.length > 0 ? (
          monthEvents.map(event => {
            const { postalCode, city } = extractLocationInfo(event.description);
            const startDate = parseISO(event.start);
            const endDate = parseISO(event.end);
            const isSameDay = format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd');
            
            return (
              <div 
                key={event.id} 
                className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col"
                style={{ borderTop: `4px solid ${event.color}` }}
              >
                <div className="p-4 flex-grow">
                  <div className="flex justify-between items-start mb-2">
                    <div className="bg-gray-100 text-gray-800 text-sm font-medium px-2.5 py-0.5 rounded">
                      {postalCode}
                    </div>
                    <div 
                      className="text-sm px-2 py-1 rounded" 
                      style={{ backgroundColor: `${event.color}20`, color: event.color }}
                    >
                      {format(startDate, 'dd MMM', { locale: fr })}
                      {!isSameDay && ` - ${format(endDate, 'dd MMM', { locale: fr })}`}
                    </div>
                  </div>
                  
                  <h3 className="text-lg font-bold mb-2 text-gray-800 line-clamp-2 h-14">
                    {event.title}
                  </h3>
                  
                  <div className="flex items-center mb-3 text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate">{city}</span>
                  </div>
                </div>
                
                <div className="px-4 pb-4">
                  <a 
                    href={event.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md text-sm transition-colors duration-300"
                  >
                    Voir les détails
                  </a>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-3 text-center py-12">
            <div className="bg-green-50 p-6 rounded-lg">
              <svg className="mx-auto h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-2 text-lg font-medium text-gray-900">Aucun événement trouvé</h3>
              <p className="mt-1 text-sm text-gray-500">
                Aucun événement n'est prévu pour ce mois dans cette région ou ce département.
              </p>
              <p className="mt-3 text-sm text-green-600">
                Essayez de changer vos critères de recherche ou consultez d'autres mois.
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Animation fleur en arrière-plan */}
      <div className="fixed -z-10 bottom-0 right-0 opacity-10 pointer-events-none">
        <svg width="400" height="400" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 0C50 27.6142 27.6142 50 0 50C27.6142 50 50 72.3858 50 100C50 72.3858 72.3858 50 100 50C72.3858 50 50 27.6142 50 0Z" fill="#4ADE80"/>
        </svg>
      </div>
    </div>
  );
};

export default EventFlower;