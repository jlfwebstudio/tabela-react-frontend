// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons';
import './App.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function App() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(null); // Coluna do filtro aberto
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({}); // CORREÇÃO: Declarado aqui
  const [searchTerm, setSearchTerm] = useState(''); // Estado para o campo de pesquisa global

  const filterDropdownRefs = useRef({}); // Ref para cada dropdown de filtro

  // Define os cabeçalhos da tabela na ordem desejada
  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  // Lista de status permitidos (permanente)
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO',
  ], []);

  // Função para normalizar strings para comparação (case-insensitive, sem acentos)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    // Tenta parsear a data no formato DD/MM/YYYY
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      // Cria um objeto Date no formato YYYY-MM-DD para evitar problemas de interpretação
      const date = new Date(`${year}-${month}-${day}T00:00:00`);
      if (!isNaN(date.getTime())) {
        return `${day}/${month}/${year}`;
      }
    }
    return dateString; // Retorna original se não conseguir formatar
  }, []);

  // Função para parsear a data para comparação (retorna objeto Date)
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(Number);
      // Cria um objeto Date usando os componentes para evitar problemas de fuso horário/locale
      return new Date(year, month - 1, day); // Mês é 0-indexado
    }
    return null;
  }, []);

  // Lógica para determinar a classe da linha (cor)
  const getRowClass = useCallback((item) => {
    const dataLimiteStr = item['Data Limite'];
    const justificativa = item['Justificativa do Abono'];

    if (!dataLimiteStr) return '';

    const dataLimite = parseDateForComparison(dataLimiteStr);
    if (!dataLimite) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparação apenas de data

    const diffTime = dataLimite.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Linha atrasada (vermelho intenso)
    if (diffDays < 0) {
      return 'row-overdue';
    }
    // Linha vencendo hoje (amarelo)
    if (diffDays === 0) {
      return 'row-due-today';
    }
    return '';
  }, [parseDateForComparison]);

  // Lógica para determinar a classe da célula de Justificativa do Abono
  const getJustificativaCellClass = useCallback((item) => {
    const rowClass = getRowClass(item);
    const justificativa = item['Justificativa do Abono'];

    // Se a linha está atrasada E a justificativa está vazia, aplica a cor roxa
    if (rowClass === 'row-overdue' && !justificativa) {
      return 'cell-falta-abonar';
    }
    return '';
  }, [getRowClass]);

  // Função para lidar com a seleção do arquivo
  const handleFileChange = useCallback((event) => { // CORREÇÃO: Declarado aqui
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
    } else {
      setFile(null);
      setFileName('');
    }
  }, []);

  // Função para fazer o upload do arquivo para o backend
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para fazer o upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
      // Inicializa os filtros de status com os permitidos
      const initialStatusFilters = {};
      allowedStatuses.forEach(status => {
        initialStatusFilters[status] = true;
      });
      setSelectedFilterOptions(prev => ({
        ...prev,
        Status: initialStatusFilters
      }));
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao fazer upload do arquivo. Verifique o console para mais detalhes.');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [file, allowedStatuses]);

  // Função para alternar a ordenação da coluna
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Função para abrir/fechar o dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setFilterDropdownOpen(prev => (prev === column ? null : column));
  }, []);

  // Função para lidar com a mudança de opção de filtro
  const handleFilterOptionChange = useCallback((column, option, isChecked) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: {
        ...(prev[column] || {}),
        [option]: isChecked,
      },
    }));
  }, []);

  // Função para aplicar os filtros
  const applyFilters = useCallback(() => {
    setFilterDropdownOpen(null); // Fecha o dropdown após aplicar
  }, []);

  // Função para limpar um filtro de coluna específico
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => {
      const newState = { ...prev };
      delete newState[column];
      return newState;
    });
  }, []);

  // Função para limpar todos os filtros (exceto os de status permanentes)
  const clearAllFilters = useCallback(() => {
    setSelectedFilterOptions(prev => {
      const newStatusFilters = {};
      allowedStatuses.forEach(status => {
        newStatusFilters[status] = true;
      });
      return { Status: newStatusFilters };
    });
  }, [allowedStatuses]);


  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownOpen && filterDropdownRefs.current[filterDropdownOpen] &&
          !filterDropdownRefs.current[filterDropdownOpen].contains(event.target) &&
          !event.target.closest('.filter-icon')) { // Garante que clicar no ícone não feche
        setFilterDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownOpen]);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Filtrar por termo de pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentData = currentData.filter(item =>
        tableHeaders.some(header =>
          normalizeForComparison(item[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // 2. Filtrar por status permitidos (permanente)
    currentData = currentData.filter(item =>
      allowedStatuses.includes(item.Status)
    );

    // 3. Aplicar filtros de coluna selecionados
    currentData = currentData.filter(item => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions) return true; // Nenhum filtro aplicado para esta coluna

        const itemValue = normalizeForComparison(item[header]);
        const activeOptions = Object.keys(selectedOptions).filter(option => selectedOptions[option]);

        if (activeOptions.length === 0) return true; // Se todas as opções estão desmarcadas, não filtra
        return activeOptions.some(option => normalizeForComparison(option) === itemValue);
      });
    });

    // 4. Ordenar
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Lógica de ordenação para datas
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1;
          if (!dateB) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Lógica de ordenação para outros tipos (string, number)
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        // Fallback para outros tipos ou mistos
        return 0;
      });
    }

    return currentData;
  }, [data, sortColumn, sortDirection, selectedFilterOptions, tableHeaders, allowedStatuses, normalizeForComparison, parseDateForComparison, searchTerm]);


  // Contagem de itens atrasados
  const overdueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return filteredAndSortedData.filter(item => {
      const dataLimite = parseDateForComparison(item['Data Limite']);
      return dataLimite && dataLimite.getTime() < today.getTime();
    }).length;
  }, [filteredAndSortedData, parseDateForComparison]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingToday = filteredAndSortedData.filter(item => {
      const dataLimite = parseDateForComparison(item['Data Limite']);
      if (!dataLimite) return false;

      const diffTime = dataLimite.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays <= 0; // Atrasados ou vencendo hoje
    });

    if (pendingToday.length === 0) {
      alert('Não há itens pendentes para exportar.');
      return;
    }

    const ws_data = [tableHeaders.map(header => ({ v: header, t: 's', s: { font: { bold: true } } }))]; // Cabeçalhos em negrito

    pendingToday.forEach(item => {
      const row = tableHeaders.map(header => {
        let cellValue = item[header];
        let cellStyle = {};

        // Aplica estilo de cor de fundo da linha
        const rowClass = getRowClass(item);
        if (rowClass === 'row-overdue') {
          cellStyle.fill = { fgColor: { rgb: 'C00000' } }; // Vermelho intenso
          cellStyle.font = { color: { rgb: 'FFFFFF' } }; // Texto branco
        } else if (rowClass === 'row-due-today') {
          cellStyle.fill = { fgColor: { rgb: 'FFC000' } }; // Amarelo
          cellStyle.font = { color: { rgb: '000000' } }; // Texto preto
        }

        // Estilo específico para "FALTA ABONAR"
        if (header === 'Justificativa do Abono' && getJustificativaCellClass(item) === 'cell-falta-abonar') {
          cellValue = 'FALTA ABONAR';
          cellStyle.fill = { fgColor: { rgb: '800080' } }; // Roxo intenso
          cellStyle.font = { color: { rgb: 'FFFFFF' } }; // Texto branco
        }

        // Formatação de CNPJ/CPF para texto
        if (header === 'CNPJ / CPF') {
          cellValue = String(cellValue).replace(/["'=]/g, '').trim(); // Remove aspas e '='
          return { v: cellValue, t: 's', s: cellStyle };
        }

        // Formatação de Data Limite para texto
        if (header === 'Data Limite') {
          cellValue = formatDataLimite(cellValue);
          return { v: cellValue, t: 's', s: cellStyle };
        }

        return { v: cellValue, t: 's', s: cellStyle };
      });
      ws_data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Ajusta a largura das colunas no Excel
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço') width = 30;
      else if (header === 'Justificativa do Abono') width = 40;
      else if (header === 'CNPJ / CPF') width = 20;
      else if (header === 'Numero Referencia') width = 18;
      else if (header === 'Contratante') width = 25;
      else if (header === 'Cliente') width = 25;
      else if (header === 'Técnico') width = 25;
      else if (header === 'Prestador') width = 25;
      return { wch: width };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    XLSX.writeFile(wb, 'pendentes_hoje.xlsx');
  }, [filteredAndSortedData, tableHeaders, parseDateForComparison, getRowClass, getJustificativaCellClass, formatDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de Ordens de Serviço</h1>
      </header>

      <main className="App-main">
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar CSV'}
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange} // CORREÇÃO: handleFileChange referenciado corretamente
              style={{ display: 'none' }}
            />
            <button onClick={handleUpload} className="process-csv-button" disabled={!file || loading}>
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : 'Processar CSV'}
            </button>
          </div>

          <div className="global-actions-section">
            <div className="search-container">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Pesquisar na tabela..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <button onClick={exportToExcel} className="export-button" disabled={data.length === 0}>
              Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              Atrasos: {overdueCount}
            </div>
          </div>
        </div>

        {error && <p className="error-message">{error}</p>}

        {loading && data.length === 0 && <p>Carregando dados...</p>}

        {data.length > 0 && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map((header) => (
                    <th key={header} className={`col-${header.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      <div className="header-content">
                        <span onClick={() => handleSort(header)} className="sortable-header">
                          {header}
                        </span>
                        <div className="sort-icons">
                          <FontAwesomeIcon
                            icon={faSortUp}
                            className={sortColumn === header && sortDirection === 'asc' ? 'active' : ''}
                            onClick={() => handleSort(header)}
                          />
                          <FontAwesomeIcon
                            icon={faSortDown}
                            className={sortColumn === header && sortDirection === 'desc' ? 'active' : ''}
                            onClick={() => handleSort(header)}
                          />
                        </div>
                        <div className="filter-icon" ref={el => filterDropdownRefs.current[header] = el}>
                          <FontAwesomeIcon
                            icon={faFilter}
                            className={filterDropdownOpen === header || (selectedFilterOptions[header] && Object.values(selectedFilterOptions[header]).some(Boolean)) ? 'active' : ''}
                            onClick={(e) => { e.stopPropagation(); toggleFilterDropdown(header); }}
                          />
                          {filterDropdownOpen === header && (
                            <div className="filter-dropdown">
                              <div className="filter-options-container">
                                {Array.from(new Set(data.map(item => item[header])))
                                  .filter(option => header !== 'Status' || allowedStatuses.includes(option)) // Filtra status permitidos
                                  .sort((a, b) => String(a).localeCompare(String(b)))
                                  .map(option => (
                                    <label key={option} className="filter-option">
                                      <input
                                        type="checkbox"
                                        checked={selectedFilterOptions[header]?.[option] || false} // CORREÇÃO: selectedFilterOptions referenciado corretamente
                                        onChange={(e) => handleFilterOptionChange(header, option, e.target.checked)}
                                      />
                                      {option}
                                    </label>
                                  ))}
                              </div>
                              <div className="filter-actions">
                                <button onClick={() => applyFilters()}>Aplicar</button>
                                <button onClick={() => clearColumnFilter(header)}>Limpar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedData.length > 0 ? (
                  filteredAndSortedData.map((item, index) => (
                    <tr key={index} className={getRowClass(item)}>
                      {tableHeaders.map((header) => (
                        <td key={header} className={header === 'Justificativa do Abono' ? getJustificativaCellClass(item) : ''}>
                          {header === 'Data Limite'
                            ? formatDataLimite(item[header])
                            : (header === 'Justificativa do Abono' && getJustificativaCellClass(item) === 'cell-falta-abonar'
                              ? 'FALTA ABONAR'
                              : item[header])
                          }
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tableHeaders.length} className="no-data-message">
                      Nenhum dado corresponde aos filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data.length === 0 && !loading && !error && (
          <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
        )}
      </main>
    </div>
  );
}

export default App;
