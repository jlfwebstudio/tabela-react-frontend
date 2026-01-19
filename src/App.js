import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel, faSort } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [tableHeaders, setTableHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState('Data Limite');
  const [sortDirection, setSortDirection] = useState('asc'); // Ordenação padrão: mais antigo para mais recente
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOptions, setFilterOptions] = useState({});
  const [selectedFilterOptions, setSelectedFilterOptions] = useState({
    'Status': ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO']
  });
  const [activeFilterColumn, setActiveFilterColumn] = useState(null);

  const filterDropdownRef = useRef(null);
  const filterButtonRefs = useRef({}); // Para fechar o dropdown ao clicar em outro botão de filtro

  // Define os cabeçalhos da tabela na ordem desejada
  const defaultTableHeaders = useMemo(() => [
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

  // Normaliza strings para comparação (remove acentos, caixa baixa, espaços e caracteres especiais)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
  }, []);

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;

    const cleanedDateString = String(dateString).split(' ')[0].trim(); // Pega só a data, remove espaços

    // Tenta DD/MM/YYYY
    const partsDMY = cleanedDateString.split('/');
    if (partsDMY.length === 3) {
      const [day, month, year] = partsDMY.map(Number);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
        return date;
      }
    }

    // Tenta YYYY-MM-DD
    const partsYMD = cleanedDateString.split('-');
    if (partsYMD.length === 3) {
      const [year, month, day] = partsYMD.map(Number);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0);
        return date;
      }
    }

    // Fallback para parser nativo (pode funcionar para outros formatos, mas é menos confiável)
    const nativeDate = new Date(cleanedDateString);
    if (!isNaN(nativeDate.getTime())) {
      nativeDate.setHours(0, 0, 0, 0);
      return nativeDate;
    }

    return null; // Não conseguiu parsear
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Verifica se a OS está atrasada
  const isOverdue = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite < today;
  }, [parseDateForComparison, today]);

  // Verifica se a OS vence hoje
  const isDueToday = useCallback((row) => {
    const dataLimite = parseDateForComparison(row['Data Limite']);
    if (!dataLimite) return false;
    return dataLimite.getTime() === today.getTime();
  }, [parseDateForComparison, today]);

  // Lógica para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativaValue = String(row['Justificativa do Abono'] || '').trim();
    // A condição é: a OS está atrasada E (a justificativa está vazia OU é "falta abonar")
    return isOverdue(row) && (justificativaValue === '' || normalizeForComparison(justificativaValue) === 'falta abonar');
  }, [isOverdue, normalizeForComparison]);


  // Contador de pendências (OSs atrasadas ou vencendo hoje)
  const overdueCountDisplay = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row)).length;
  }, [data, isOverdue, isDueToday]);

  // Função para formatar a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString; // Retorna original se não puder ser formatado
  }, [parseDateForComparison]);

  // Estilos para as células da justificativa do abono
  const getJustificativaCellStyle = useCallback((row) => {
    if (isAbonarCondition(row)) {
      return {
        backgroundColor: '#8A2BE2', // Roxo
        color: 'white',
        fontWeight: 'bold',
        textAlign: 'center',
      };
    }
    return {};
  }, [isAbonarCondition]);

  // Retorna a classe CSS para a linha da tabela com base no status e data
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) return 'row-overdue';
    if (isDueToday(row)) return 'row-due-today';
    // Se não está atrasada nem vence hoje, é uma OS futura
    return 'row-default-blue';
  }, [isOverdue, isDueToday]);

  // Retorna o texto para a célula de Justificativa do Abono
  const getJustificativaCellText = useCallback((row) => {
    const justificativaValue = String(row['Justificativa do Abono'] || '').trim();
    if (isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return justificativaValue;
  }, [isAbonarCondition]);

  // Função para lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) {
      setError('Nenhum arquivo selecionado.');
      return;
    }
    setFile(uploadedFile);
    setError('');
  };

  // Função para processar o CSV
  const processCsv = async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV primeiro.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores
    setTableHeaders([]); // Limpa cabeçalhos anteriores

    const formData = new FormData();
    formData.append('file', file); // O nome do campo deve ser 'file' para corresponder ao backend

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
      }

      const result = await response.json();

      if (result.length > 0) {
        // Garante que os cabeçalhos sejam os defaultTableHeaders na ordem correta
        setTableHeaders(defaultTableHeaders);
        setData(result);

        // Inicializa as opções de filtro com base nos dados carregados
        const newFilterOptions = {};
        defaultTableHeaders.forEach(header => {
          if (header !== 'Justificativa do Abono' && header !== 'Data Limite' && header !== 'CNPJ / CPF') { // Não cria filtro para Justificativa, Data Limite e CNPJ/CPF
            const options = [...new Set(result.map(row => String(row[header] || '').trim()))].filter(Boolean).sort((a, b) => a.localeCompare(b));
            newFilterOptions[header] = options;
          }
        });
        setFilterOptions(newFilterOptions);

        // Reinicia os filtros selecionados para o estado inicial (todos selecionados ou padrão)
        const initialSelected = {};
        defaultTableHeaders.forEach(header => {
          if (header === 'Status') {
            initialSelected[header] = ['ENCAMINHADA', 'EM TRANSFERÊNCIA', 'EM CAMPO', 'REENCAMINHADO', 'PROCEDIMENTO TÉCNICO'];
          } else if (newFilterOptions[header]) {
            initialSelected[header] = newFilterOptions[header];
          }
        });
        setSelectedFilterOptions(initialSelected);

      } else {
        setError('O arquivo CSV não contém dados válidos ou está vazio.');
      }
    } catch (err) {
      console.error('Erro no processamento do CSV:', err);
      setError(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de ordenação
  const handleSort = useCallback((column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Lógica de filtragem
  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const current = prev[column] || [];
      if (current.includes(option)) {
        return { ...prev, [column]: current.filter(item => item !== option) };
      } else {
        return { ...prev, [column]: [...current, option] };
      }
    });
  }, []);

  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: filterOptions[column] || [] // Reseta para todas as opções disponíveis
    }));
  }, [filterOptions]);

  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []);

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum botão de filtro
        const clickedOnFilterButton = Object.values(filterButtonRefs.current).some(ref => ref && ref.contains(event.target));
        if (!clickedOnFilterButton) {
          setActiveFilterColumn(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Dados filtrados e ordenados
  const filteredAndSortedData = useMemo(() => {
    let currentData = [...data];

    // 1. Filtragem
    currentData = currentData.filter(row => {
      // Filtro de busca global
      const matchesSearch = searchTerm === '' ||
        Object.values(row).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        );

      if (!matchesSearch) return false;

      // Filtros de coluna
      for (const header of tableHeaders) {
        if (selectedFilterOptions[header] && selectedFilterOptions[header].length > 0) {
          const rowValue = String(row[header] || '').trim();
          if (!selectedFilterOptions[header].includes(rowValue)) {
            return false;
          }
        }
      }
      return true;
    });

    // 2. Ordenação
    if (sortColumn) {
      currentData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        let comparison = 0;

        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue); // CORREÇÃO AQUI
          const dateB = parseDateForComparison(bValue); // CORREÇÃO AQUI

          if (dateA && dateB) {
            comparison = dateA.getTime() - dateB.getTime();
          } else if (dateA) {
            comparison = -1; // Datas válidas vêm antes de inválidas
          } else if (dateB) {
            comparison = 1;
          } else {
            comparison = 0; // Ambas inválidas, mantém ordem
          }
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else {
          // Tenta comparar como números se possível, caso contrário, fallback para string
          const numA = parseFloat(aValue);
          const numB = parseFloat(bValue);
          if (!isNaN(numA) && !isNaN(numB)) {
            comparison = numA - numB;
          } else {
            comparison = String(aValue).localeCompare(String(bValue));
          }
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return currentData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, tableHeaders, parseDateForComparison]); // parseDateForComparison adicionado às dependências

  // Função para exportar os dados filtrados e ordenados para Excel
  const exportToExcel = useCallback(() => {
    if (filteredAndSortedData.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const exportData = filteredAndSortedData.map(row => {
      const newRow = {};
      defaultTableHeaders.forEach(header => {
        let value = row[header];
        if (header === 'Data Limite') {
          const dateObj = parseDateForComparison(value);
          newRow[header] = dateObj ? XLSX.utils.date_to_num(dateObj) : value; // Converte para número de série do Excel
        } else if (header === 'CNPJ / CPF') {
          newRow[header] = String(value || '').replace(/['"=]/g, '').trim(); // Garante que seja string e limpa
        } else if (header === 'Justificativa do Abono' && isAbonarCondition(row)) {
          newRow[header] = 'FALTA ABONAR';
        } else {
          newRow[header] = value;
        }
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData, { header: defaultTableHeaders });

    // --- Definição de Estilos ---
    const headerStyle = {
      font: { name: 'Arial', sz: 12, bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF4F81BD' } }, // Azul escuro
      alignment: { vertical: 'center', horizontal: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      },
    };

    const defaultBlueRowStyle = {
      font: { name: 'Arial', sz: 10, color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFADD8E6' } }, // Azul clarinho
      alignment: { vertical: 'center', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      },
    };

    const overdueRowStyle = {
      font: { name: 'Arial', sz: 10, color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFFFC7CE' } }, // Vermelho claro
      alignment: { vertical: 'center', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      },
    };

    const dueTodayRowStyle = {
      font: { name: 'Arial', sz: 10, color: { argb: 'FF000000' } }, // Preto
      fill: { fgColor: { argb: 'FFFFFFCC' } }, // Amarelo claro
      alignment: { vertical: 'center', horizontal: 'left' },
      border: {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      },
    };

    const abonarCellStyle = {
      font: { name: 'Arial', sz: 10, bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF8A2BE2' } }, // Roxo
      alignment: { vertical: 'center', horizontal: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      },
    };

    // --- Aplicação de Estilos e Formatos ---
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress];

        if (!cell) continue;

        // Aplica estilo de cabeçalho
        if (R === 0) {
          cell.s = headerStyle;
        } else {
          // Aplica estilo de linha condicional
          const originalRowData = filteredAndSortedData[R - 1]; // -1 porque a primeira linha é o cabeçalho
          let currentRowBaseStyle = defaultBlueRowStyle; // Padrão azul clarinho

          if (isOverdue(originalRowData)) {
            currentRowBaseStyle = overdueRowStyle; // Vermelho se atrasada
          } else if (isDueToday(originalRowData)) {
            currentRowBaseStyle = dueTodayRowStyle; // Amarelo se vence hoje
          }

          // Inicializa o estilo da célula com o estilo base da linha
          cell.s = { ...currentRowBaseStyle };

          // Estilos específicos por coluna
          const header = defaultTableHeaders[C];

          if (header === 'Data Limite') {
            cell.t = 'n'; // Tipo numérico para datas
            cell.s.numFmt = 'DD/MM/YYYY'; // Formato de data
            cell.s.alignment = { ...cell.s.alignment, horizontal: 'center' }; // Centraliza a data
          } else if (header === 'CNPJ / CPF') {
            cell.t = 's'; // Tipo string para CNPJ/CPF
            cell.s.numFmt = '@'; // Formato de texto
            cell.s.alignment = { ...cell.s.alignment, horizontal: 'center' }; // Centraliza CNPJ/CPF
          } else if (header === 'Justificativa do Abono' && isAbonarCondition(originalRowData)) {
            // Aplica o estilo roxo por cima do estilo da linha
            cell.s = { ...cell.s, ...abonarCellStyle };
          }
        }
      }
    }

    // --- Largura de Colunas Dinâmica ---
    const colWidths = defaultTableHeaders.map((header, i) => {
      const headerLength = header.length;
      const maxCellLength = exportData.reduce((max, row) => {
        const cellValue = String(row[header] || '');
        return Math.max(max, cellValue.length);
      }, 0);
      return { wch: Math.max(headerLength, maxCellLength) + 2 }; // +2 para um pequeno padding
    });
    ws['!cols'] = colWidths;

    // --- AutoFiltro e Congelar Painéis ---
    ws['!autofilter'] = { ref: range.s.r + ':' + range.e.r }; // Aplica autofiltro a todas as linhas
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }; // Congela a primeira linha (cabeçalho)

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendencias');
    XLSX.writeFile(wb, 'pendencias.xlsx');
  }, [filteredAndSortedData, defaultTableHeaders, isAbonarCondition, isOverdue, isDueToday, parseDateForComparison]); // parseDateForComparison adicionado às dependências

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de OSs</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} /> {file ? file.name : 'Escolher CSV'}
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            <button onClick={processCsv} disabled={!file || loading} className="process-csv-button">
              {loading ? 'Processando...' : 'Processar CSV'}
            </button>
          </div>
          <div className="global-actions-section">
            <div className="overdue-count">
              Pendentes Hoje: {overdueCountDisplay}
            </div>
            <button onClick={exportToExcel} disabled={data.length === 0} className="export-button">
              <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
            </button>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      {data.length > 0 && (
        <div className="table-container">
          <div className="search-container">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar em todas as colunas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header}>
                    <div className="th-content">
                      <span onClick={() => handleSort(header)} className="sortable-header">
                        {header}
                        {sortColumn === header && (
                          <FontAwesomeIcon
                            icon={sortDirection === 'asc' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                        {sortColumn !== header && <FontAwesomeIcon icon={faSort} className="sort-icon-default" />}
                      </span>
                      <div className="filter-wrapper">
                        <FontAwesomeIcon
                          icon={faFilter}
                          ref={el => filterButtonRefs.current[header] = el} // Atribui a ref
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown" ref={filterDropdownRef}>
                            <div className="filter-options-container">
                              {filterOptions[header] && filterOptions[header].map(option => (
                                <label key={option} className="filter-option">
                                  <input
                                    type="checkbox"
                                    checked={(selectedFilterOptions[header] || []).includes(option)}
                                    onChange={() => handleFilterOptionChange(header, option)}
                                  />
                                  {option}
                                </label>
                              ))}
                            </div>
                            <div className="filter-actions">
                              <button onClick={() => setActiveFilterColumn(null)}>Aplicar</button>
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
              {filteredAndSortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClass(row)}>
                  {tableHeaders.map(header => (
                    <td
                      key={header}
                      className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}
                      style={header === 'Justificativa do Abono' ? getJustificativaCellStyle(row) : {}}
                    >
                      {header === 'Justificativa do Abono'
                        ? getJustificativaCellText(row)
                        : header === 'Data Limite'
                          ? formatDataLimite(row[header])
                          : header === 'CNPJ / CPF'
                            ? String(row[header] || '').replace(/['"=]/g, '').trim()
                            : row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
