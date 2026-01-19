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
  const [currentOverdueCount, setCurrentOverdueCount] = useState(0); // Contador de pendências

  const filterDropdownRef = useRef(null);

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

  // Normaliza strings para comparação (remove acentos, caixa baixa, espaços extras)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' && str !== null && str !== undefined) return String(str);
    if (typeof str !== 'string') return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // Função para parsear a data no formato DD/MM/YYYY para um objeto Date
  const parseDateForComparison = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    return isNaN(date.getTime()) ? null : date;
  }, []);

  // Formata a data para exibição (apenas DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    const date = parseDateForComparison(dateString);
    if (date && !isNaN(date)) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateString;
  }, [parseDateForComparison]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Formata a data de hoje para o nome do arquivo Excel
  const todayFormatted = useMemo(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
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

  // Verifica a condição para "FALTA ABONAR"
  const isAbonarCondition = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    const normalizedJustificativa = normalizeForComparison(justificativa);
    return normalizedJustificativa === '' || normalizedJustificativa === 'falta abonar';
  }, [normalizeForComparison]);

  // Retorna o estilo para a célula 'Justificativa do Abono'
  const getJustificativaCellStyle = useCallback((row) => {
    if (isOverdue(row) && isAbonarCondition(row)) {
      return {
        backgroundColor: '#800080', // Roxo intenso
        color: '#FFFFFF', // Texto branco
        fontWeight: 'bold',
        textAlign: 'center'
      };
    }
    return {};
  }, [isOverdue, isAbonarCondition]);

  // Retorna o texto para a célula 'Justificativa do Abono'
  const getJustificativaCellText = useCallback((row) => {
    const justificativa = String(row['Justificativa do Abono'] || '').trim();
    if (isOverdue(row) && isAbonarCondition(row)) {
      return 'FALTA ABONAR';
    }
    return justificativa;
  }, [isOverdue, isAbonarCondition]);

  // Retorna a classe CSS para a linha da tabela com base no status da OS
  const getRowClass = useCallback((row) => {
    if (isOverdue(row)) {
      return 'row-overdue';
    }
    if (isDueToday(row)) {
      return 'row-due-today';
    }
    return '';
  }, [isOverdue, isDueToday]);

  // Lida com a seleção de arquivos CSV
  const handleFileChange = useCallback((event) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setError(''); // Limpa qualquer erro anterior
    }
  }, []);

  // Lida com o upload do arquivo CSV para o backend
  const handleUpload = useCallback(async () => {
    if (!file) {
      setError('Por favor, selecione um arquivo CSV para upload.');
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file); // Usando 'file' como nome do campo, conforme o backend espera

    try {
      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = `Erro no servidor: ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMessage += ` - ${errorBody.message || JSON.stringify(errorBody)}`;
        } catch {
          const errorText = await response.text();
          errorMessage += ` - ${errorText.substring(0, 100)}...`; // Limita o tamanho do texto do erro
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result && result.length > 0) {
        setData(result);
        // Define os cabeçalhos da tabela com base nas chaves do primeiro objeto de dados,
        // mas na ordem definida por defaultTableHeaders.
        const actualHeaders = Object.keys(result[0]);
        const orderedHeaders = defaultTableHeaders.filter(header => actualHeaders.includes(header));
        setTableHeaders(orderedHeaders);

        // Extrai opções de filtro para cada coluna
        const newFilterOptions = {};
        orderedHeaders.forEach(header => {
          const options = [...new Set(result.map(row => String(row[header] || '').trim()))].filter(Boolean).sort();
          newFilterOptions[header] = options;
        });
        setFilterOptions(newFilterOptions);

        // Reinicia filtros selecionados para incluir novas opções, se houver
        setSelectedFilterOptions(prev => {
          const newSelected = { ...prev };
          orderedHeaders.forEach(header => {
            if (!newSelected[header] || newSelected[header].length === 0) {
              // Se não houver filtros pré-selecionados para esta coluna, selecione todos por padrão
              newSelected[header] = newFilterOptions[header];
            } else {
              // Se houver, garanta que os filtros existentes ainda são válidos e adicione novos se necessário
              newSelected[header] = newSelected[header].filter(opt => newFilterOptions[header].includes(opt));
              // Opcional: Adicionar novas opções automaticamente se desejar
              // newSelected[header] = [...new Set([...newSelected[header], ...newFilterOptions[header]])];
            }
          });
          return newSelected;
        });

      } else {
        setData([]);
        setTableHeaders([]);
        setFilterOptions({});
        setSelectedFilterOptions({});
        setError('Nenhum dado válido foi extraído do CSV.');
      }
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError(`Erro ao processar o arquivo: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [file, backendUrl, defaultTableHeaders]);

  // Lida com a mudança na barra de pesquisa
  const handleSearchChange = useCallback((event) => {
    setSearchTerm(event.target.value);
  }, []);

  // Lida com a mudança de seleção de opções de filtro
  const handleFilterOptionChange = useCallback((column, option) => {
    setSelectedFilterOptions(prev => {
      const currentOptions = prev[column] || [];
      if (currentOptions.includes(option)) {
        return {
          ...prev,
          [column]: currentOptions.filter(item => item !== option)
        };
      } else {
        return {
          ...prev,
          [column]: [...currentOptions, option]
        };
      }
    });
  }, []);

  // Aplica o filtro de coluna (não faz nada, pois o filtro é aplicado em tempo real pelo useMemo)
  const applyColumnFilter = useCallback(() => {
    setActiveFilterColumn(null); // Fecha o dropdown após "aplicar"
  }, []);

  // Limpa o filtro de uma coluna específica
  const clearColumnFilter = useCallback((column) => {
    setSelectedFilterOptions(prev => ({
      ...prev,
      [column]: filterOptions[column] || [] // Reseta para todas as opções disponíveis
    }));
    setActiveFilterColumn(null); // Fecha o dropdown
  }, [filterOptions]);

  // Lida com a abertura/fechamento do dropdown de filtro
  const toggleFilterDropdown = useCallback((column) => {
    setActiveFilterColumn(prev => (prev === column ? null : column));
  }, []); // Removido normalizeForComparison

  // Fecha o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setActiveFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownRef]);

  // Filtra e ordena os dados da tabela
  const filteredAndSortedData = useMemo(() => {
    let filteredData = data;

    // Aplica filtro de pesquisa
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      filteredData = filteredData.filter(row =>
        tableHeaders.some(header =>
          normalizeForComparison(row[header]).includes(normalizedSearchTerm)
        )
      );
    }

    // Aplica filtros de coluna
    filteredData = filteredData.filter(row => {
      return tableHeaders.every(header => {
        const selectedOptions = selectedFilterOptions[header];
        if (!selectedOptions || selectedOptions.length === 0) {
          return true; // Se nenhuma opção selecionada, não filtra
        }
        const rowValue = String(row[header] || '').trim();
        return selectedOptions.includes(rowValue);
      });
    });

    // Calcula o contador de pendências atrasadas
    let count = 0;
    filteredData.forEach(row => {
      if (isOverdue(row)) {
        count++;
      }
    });
    setCurrentOverdueCount(count);

    // Aplica ordenação
    if (sortColumn) {
      filteredData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Lógica de ordenação para 'Data Limite'
        if (sortColumn === 'Data Limite') {
          const dateA = parseDateForComparison(aValue);
          const dateB = parseDateForComparison(bValue);

          if (dateA === null && dateB === null) return 0;
          if (dateA === null) return sortDirection === 'asc' ? 1 : -1;
          if (dateB === null) return sortDirection === 'asc' ? -1 : 1;

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Ordenação padrão para outras colunas (string)
        const normalizedA = normalizeForComparison(aValue);
        const normalizedB = normalizeForComparison(bValue);

        if (normalizedA < normalizedB) return sortDirection === 'asc' ? -1 : 1;
        if (normalizedA > normalizedB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filteredData;
  }, [data, searchTerm, selectedFilterOptions, sortColumn, sortDirection, parseDateForComparison, normalizeForComparison, isOverdue, isDueToday, setCurrentOverdueCount]); // Removido tableHeaders

  // Filtra os dados para exportação (apenas pendências de hoje)
  const filteredForExport = useMemo(() => {
    return data.filter(row => isOverdue(row) || isDueToday(row));
  }, [data, isOverdue, isDueToday]);

  // Exporta os dados filtrados para um arquivo Excel
  const exportToExcel = useCallback(() => {
    if (filteredForExport.length === 0) {
      alert('Não há dados de pendências para exportar.');
      return;
    }

    const exportData = filteredForExport.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        // Formata 'Data Limite' para exibição no Excel antes de exportar
        if (header === 'Data Limite') {
          newRow[header] = formatDataLimite(row[header]);
        } else if (header === 'CNPJ / CPF') {
          newRow[header] = String(row[header] || '').replace(/['"=]/g, '').trim();
        } else {
          newRow[header] = row[header];
        }
      });
      return newRow;
    });

    const ws_data = [tableHeaders, ...exportData.map(row => tableHeaders.map(header => row[header]))];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Define larguras de coluna
    const wscols = tableHeaders.map(header => {
      let width = 15; // Largura padrão
      if (header === 'Serviço' || header === 'Contratante' || header === 'Cliente' || header === 'Justificativa do Abono') {
        width = 30;
      } else if (header === 'Numero Referencia' || header === 'CNPJ / CPF') {
        width = 20;
      } else if (header === 'Data Limite') {
        width = 15;
      }
      return { wch: width };
    });
    ws['!cols'] = wscols;

    // Estilos para o cabeçalho
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      fill: { fgColor: { argb: 'FF4472C4' } }, // Azul escuro
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      }
    };

    // Estilos base para as linhas
    const defaultRowBaseStyle = {
      font: { color: { argb: 'FF000000' } }, // Preto
      alignment: { horizontal: 'left', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } }, // Cinza claro
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      }
    };

    const overdueRowBaseStyle = {
      ...defaultRowBaseStyle,
      fill: { fgColor: { argb: 'FFFFC7CE' } }, // Vermelho claro
      font: { color: { argb: 'FF9C0006' } }, // Vermelho escuro
    };

    const dueTodayRowBaseStyle = {
      ...defaultRowBaseStyle,
      fill: { fgColor: { argb: 'FFFFFFEB' } }, // Amarelo claro
      font: { color: { argb: 'FF9C6500' } }, // Amarelo escuro
    };

    const abonarCellStyle = {
      fill: { fgColor: { argb: 'FF800080' } }, // Roxo intenso
      font: { bold: true, color: { argb: 'FFFFFFFF' } }, // Branco
      alignment: { horizontal: 'center', vertical: 'center' },
    };

    // Aplica estilos
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress] || { t: 's', v: '' }; // Garante que a célula exista
        ws[cellAddress] = cell; // Garante que a célula esteja no worksheet

        // Estilo do cabeçalho
        if (R === 0) {
          cell.s = headerStyle;
          continue; // Pula para a próxima célula após aplicar o estilo do cabeçalho
        }

        // Estilos para as linhas de dados
        const originalRowData = filteredForExport[R - 1]; // -1 porque a linha 0 é o cabeçalho
        let currentCellStyle = { ...defaultRowBaseStyle }; // Começa com o estilo padrão

        if (originalRowData) {
          if (isOverdue(originalRowData)) {
            currentCellStyle = { ...overdueRowBaseStyle };
          } else if (isDueToday(originalRowData)) {
            currentCellStyle = { ...dueTodayRowBaseStyle };
          }

          // Estilo específico para a coluna 'Justificativa do Abono'
          if (tableHeaders[C] === 'Justificativa do Abono' && isOverdue(originalRowData) && isAbonarCondition(originalRowData)) {
            currentCellStyle = { ...currentCellStyle, ...abonarCellStyle };
          }

          // Alinhamento específico para colunas
          if (['Chamado', 'Numero Referencia', 'Status', 'Data Limite', 'Cidade'].includes(tableHeaders[C])) {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: 'center' };
          } else if (['CNPJ / CPF', 'Serviço', 'Contratante', 'Cliente', 'Técnico', 'Prestador'].includes(tableHeaders[C])) {
            currentCellStyle.alignment = { ...currentCellStyle.alignment, horizontal: 'left' };
          }
        }

        cell.s = currentCellStyle; // Aplica o estilo final à célula

        // Formatação específica para 'Data Limite'
        if (tableHeaders[C] === 'Data Limite' && originalRowData && originalRowData[tableHeaders[C]]) {
          const dateValue = parseDateForComparison(originalRowData[tableHeaders[C]]);
          if (dateValue && !isNaN(dateValue)) {
            const excelEpoch = new Date(Date.UTC(1899, 11, 30));
            const diffTime = dateValue.getTime() - excelEpoch.getTime();
            const excelDate = diffTime / (1000 * 60 * 60 * 24);
            cell.v = excelDate; // Valor numérico para o Excel
            cell.t = 'n'; // Tipo numérico
            cell.s.numFmt = 'DD/MM/YYYY'; // Formato de exibição
          }
        }
        // CNPJ / CPF como texto
        if (tableHeaders[C] === 'CNPJ / CPF' && originalRowData && originalRowData[tableHeaders[C]]) {
          cell.v = String(originalRowData[tableHeaders[C]] || '').replace(/['"=]/g, '').trim();
          cell.t = 's'; // Força como texto
        }
      }
    }

    XLSX.writeFile(wb, `Pendencias_Hoje_${todayFormatted}.xlsx`);
  }, [filteredForExport, tableHeaders, todayFormatted, isOverdue, isAbonarCondition, isDueToday, parseDateForComparison, formatDataLimite]);


  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">Painel de Pendências</h1>
          <div className="controls-container">
            <div className="upload-section">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="csv-upload-input"
              />
              <label htmlFor="csv-upload-input" className="action-button upload-action-button">
                <FontAwesomeIcon icon={faUpload} /> Selecionar CSV
              </label>
              <button onClick={handleUpload} disabled={!file || loading} className="action-button">
                {loading ? 'Processando...' : 'Carregar Dados'}
              </button>
            </div>
            <div className="search-export-section">
              <div className="search-bar">
                <FontAwesomeIcon icon={faSearch} className="search-icon" />
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
              </div>
              <button onClick={exportToExcel} className="action-button export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendentes Hoje
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && <p className="error-message">Erro: {error}</p>}

      {data.length > 0 && (
        <div className="table-wrapper"> {/* Adicionado wrapper para scroll horizontal */}
          <div className="overdue-count-display">
            <h3>Pendências Atrasadas: {currentOverdueCount}</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map(header => (
                  <th key={header} className={`col-${normalizeForComparison(header).replace(/[^a-z0-9]/g, '-')}`}>
                    <div className="th-content">
                      <div className="header-text" onClick={() => handleSort(header)}>
                        {header}
                        {sortColumn === header ? (
                          sortDirection === 'asc' ? (
                            <FontAwesomeIcon icon={faSortUp} className="sort-icon" />
                          ) : (
                            <FontAwesomeIcon icon={faSortDown} className="sort-icon" />
                          )
                        ) : (
                          <FontAwesomeIcon icon={faSort} className="sort-icon inactive" />
                        )}
                      </div>
                      <div className="filter-icon-container" ref={activeFilterColumn === header ? filterDropdownRef : null}>
                        <FontAwesomeIcon
                          icon={faFilter}
                          className={`filter-icon ${activeFilterColumn === header ? 'active' : ''}`}
                          onClick={() => toggleFilterDropdown(header)}
                        />
                        {activeFilterColumn === header && (
                          <div className="filter-dropdown">
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
                              <button onClick={applyColumnFilter}>Aplicar</button>
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
