import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown, faFilter, faSearch, faUpload, faFileExcel } from '@fortawesome/free-solid-svg-icons';
import './App.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState([]); // Dados brutos do CSV, filtrados apenas por status permitido
  const [filteredAndSortedData, setFilteredAndSortedData] = useState([]); // Dados após filtros de coluna e ordenação
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState(null);
  const [columnFilterSelections, setColumnFilterSelections] = useState({}); // { 'Coluna': ['Opcao1', 'Opcao2'] }
  const [searchTerm, setSearchTerm] = useState('');
  const filterDropdownRef = useRef(null);
  const filterButtonRefs = useRef({}); // Para referenciar cada botão de filtro

  // Definição dos cabeçalhos da tabela, incluindo propriedades de ordenação e filtro
  const tableHeaders = useMemo(() => [
    { key: 'Chamado', label: 'Chamado', sortable: true, filterable: true },
    { key: 'Numero Referencia', label: 'Número Referência', sortable: true, filterable: true },
    { key: 'Contratante', label: 'Contratante', sortable: true, filterable: true },
    { key: 'Serviço', label: 'Serviço', sortable: true, filterable: true },
    { key: 'Status', label: 'Status', sortable: true, filterable: true },
    { key: 'Data Limite', label: 'Data Limite', sortable: true, filterable: true },
    { key: 'Cliente', label: 'Cliente', sortable: true, filterable: true },
    { key: 'CNPJ / CPF', label: 'CNPJ / CPF', sortable: true, filterable: true },
    { key: 'Cidade', label: 'Cidade', sortable: true, filterable: true },
    { key: 'Técnico', label: 'Técnico', sortable: true, filterable: true },
    { key: 'Prestador', label: 'Prestador', sortable: true, filterable: true },
    { key: 'Justificativa do Abono', label: 'Justificativa do Abono', sortable: true, filterable: true },
  ], []);

  // Status permitidos para exibição na tabela (memoizado para estabilidade)
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  // Função auxiliar para normalizar strings para comparação (ignora acentos e caixa)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' || str === null) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }, []);

  // Função para parsear data DD/MM/YYYY de forma segura para um objeto Date
  const parseDate = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Mês é 0-indexado no JS
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      // Valida se a data criada corresponde aos valores originais (evita 31/02 virar 02/03)
      if (date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
        return date;
      }
    }
    return null; // Retorna null para datas inválidas
  }, []);

  // Função para formatar a data para exibição (DD/MM/YYYY)
  const formatDataLimite = useCallback((dateString) => {
    const date = parseDate(dateString);
    if (date) {
      return date.toLocaleDateString('pt-BR');
    }
    return dateString; // Retorna o original se não for uma data válida
  }, [parseDate]);

  // Função para formatar CNPJ/CPF
  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, ''); // Remove tudo que não é dígito
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); // CPF
    }
    if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); // CNPJ
    }
    return value; // Retorna o valor original se não for CPF nem CNPJ
  }, []);

  // Função para verificar status de data (atrasado, hoje, precisa de abono)
  const getStatusDates = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const dataLimite = parseDate(dataLimiteStr);
    const justificativa = normalizeForComparison(row['Justificativa do Abono']);
    const status = normalizeForComparison(row['Status']);

    if (!dataLimite || !allowedStatuses.map(normalizeForComparison).includes(status)) {
      return { isOverdue: false, isDueToday: false, needsAbono: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const limiteDateOnly = new Date(dataLimite);
    limiteDateOnly.setHours(0, 0, 0, 0);

    const isOverdue = limiteDateOnly < today;
    const isDueToday = limiteDateOnly.getTime() === today.getTime();
    const needsAbono = isOverdue && (justificativa === '' || justificativa === 'falta abonar');

    return { isOverdue, isDueToday, needsAbono };
  }, [parseDate, normalizeForComparison, allowedStatuses]);

  // Lógica de classes para colorir as linhas
  const getRowClass = useCallback((row) => {
    const { isOverdue, isDueToday } = getStatusDates(row);
    if (isOverdue) {
      return 'row-overdue'; // Vermelho intenso para todas as atrasadas
    }
    if (isDueToday) {
      return 'row-due-today'; // Amarelo para vencendo hoje
    }
    return '';
  }, [getStatusDates]);

  // Lógica para formatar o valor da célula (ex: "FALTA ABONAR")
  const getCellContent = useCallback((value, headerKey, row) => {
    if (headerKey === 'Data Limite') {
      return formatDataLimite(value);
    }
    if (headerKey === 'CNPJ / CPF') {
      return formatCnpjCpf(value);
    }
    if (headerKey === 'Justificativa do Abono') {
      const { isOverdue, needsAbono } = getStatusDates(row);
      if (isOverdue && needsAbono) {
        return 'FALTA ABONAR';
      }
    }
    return value;
  }, [formatDataLimite, formatCnpjCpf, getStatusDates]);

  // Lógica para classe da célula (ex: roxo para "FALTA ABONAR")
  const getCellClass = useCallback((row, headerKey) => {
    if (headerKey === 'Justificativa do Abono') {
      const { isOverdue, needsAbono } = getStatusDates(row);
      if (isOverdue && needsAbono) {
        return 'cell-falta-abonar'; // Roxo para a célula de justificativa
      }
    }
    return '';
  }, [getStatusDates]);

  // Lidar com o upload do arquivo
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('Por favor, selecione um arquivo CSV para fazer o upload.');
      return;
    }

    setLoading(true);
    setError('');
    setData([]); // Limpa dados anteriores
    setFilteredAndSortedData([]); // Limpa dados filtrados/ordenados anteriores
    setColumnFilterSelections({}); // Limpa filtros de coluna
    setFilterDropdownOpen(false); // Fecha qualquer dropdown aberto
    setFilterColumn(null); // Reseta a coluna de filtro
    setSearchTerm(''); // Limpa a pesquisa global

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data && Array.isArray(response.data)) {
        // Filtra os dados brutos com base nos status permitidos imediatamente
        const initialFilteredData = response.data.filter(row =>
          allowedStatuses.some(status => normalizeForComparison(row.Status) === normalizeForComparison(status))
        );
        setData(initialFilteredData);
      } else {
        setError('Formato de dados inesperado do servidor.');
        setData([]);
      }
    } catch (err) {
      console.error('Erro no upload:', err);
      setError(`Erro ao fazer upload do arquivo: ${err.response?.data?.error || err.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Efeito para aplicar filtros de coluna, pesquisa global e ordenação
  useEffect(() => {
    let currentProcessedData = [...data];

    // 1. Aplica a pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentProcessedData = currentProcessedData.filter(row =>
        tableHeaders.some(header => {
          const value = row[header.key];
          return normalizeForComparison(value).includes(normalizedSearchTerm);
        })
      );
    }

    // 2. Aplica os filtros de coluna
    tableHeaders.forEach(header => {
      const selectedOptions = columnFilterSelections[header.key];
      if (selectedOptions && selectedOptions.length > 0) {
        currentProcessedData = currentProcessedData.filter(row =>
          selectedOptions.includes(row[header.key])
        );
      }
    });

    // 3. Aplica a ordenação
    if (sortColumn) {
      currentProcessedData.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Lógica especial para Data Limite
        if (sortColumn === 'Data Limite') {
          const dateA = parseDate(aValue);
          const dateB = parseDate(bValue);

          if (!dateA && !dateB) return 0;
          if (!dateA) return sortDirection === 'asc' ? 1 : -1; // Valores nulos no final
          if (!dateB) return sortDirection === 'asc' ? -1 : 1; // Valores nulos no final

          return sortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
        }

        // Para outros tipos, tenta comparação numérica ou string
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }
        // Fallback para comparação de string case-insensitive e sem acentos
        const normalizedA = normalizeForComparison(aValue);
        const normalizedB = normalizeForComparison(bValue);
        return sortDirection === 'asc'
          ? normalizedA.localeCompare(normalizedB)
          : normalizedB.localeCompare(normalizedA);
      });
    }

    setFilteredAndSortedData(currentProcessedData);
  }, [data, searchTerm, columnFilterSelections, sortColumn, sortDirection, tableHeaders, normalizeForComparison, parseDate]);

  // Lidar com a ordenação da tabela
  const handleSort = useCallback((columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  }, [sortColumn, sortDirection]);

  // Lidar com a abertura/fechamento do dropdown de filtro
  const handleFilterButtonClick = useCallback((columnKey, event) => {
    event.stopPropagation(); // Impede que o clique se propague e feche o dropdown imediatamente

    // Se o mesmo filtro for clicado, fecha
    if (filterColumn === columnKey && filterDropdownOpen) {
      setFilterDropdownOpen(false);
      setFilterColumn(null);
      return;
    }

    setFilterColumn(columnKey);
    setFilterDropdownOpen(true);

    // Posiciona o dropdown abaixo do botão de filtro
    const buttonRect = event.currentTarget.getBoundingClientRect();
    if (filterDropdownRef.current) {
      filterDropdownRef.current.style.top = `${buttonRect.bottom + window.scrollY + 5}px`;
      filterDropdownRef.current.style.left = `${buttonRect.left + window.scrollX}px`;
    }

    // Inicializa as opções de filtro para a coluna se ainda não existirem
    if (!columnFilterSelections[columnKey]) {
      const uniqueValues = [...new Set(data.map(row => row[columnKey]))]
        .filter(value => value !== undefined && value !== null && value !== '')
        .sort((a, b) => normalizeForComparison(a).localeCompare(normalizeForComparison(b)));
      setColumnFilterSelections(prev => ({
        ...prev,
        [columnKey]: uniqueValues // Inicialmente, todas as opções estão selecionadas
      }));
    }
  }, [filterColumn, filterDropdownOpen, data, columnFilterSelections, normalizeForComparison]);

  // Lidar com a seleção/desseleção de opções de filtro
  const handleFilterOptionChange = useCallback((option, isChecked) => {
    setColumnFilterSelections(prev => { // CORREÇÃO: Usar setColumnFilterSelections
      const currentOptions = prev[filterColumn] || [];
      if (isChecked) {
        return {
          ...prev,
          [filterColumn]: [...currentOptions, option]
        };
      } else {
        return {
          ...prev,
          [filterColumn]: currentOptions.filter(item => item !== option)
        };
      }
    });
  }, [filterColumn]);

  // Aplicar filtros de coluna
  const applyColumnFilters = useCallback(() => {
    setFilterDropdownOpen(false);
  }, []);

  // Limpar filtros de uma coluna específica
  const clearColumnFilter = useCallback(() => {
    setColumnFilterSelections(prev => ({ // CORREÇÃO: Usar setColumnFilterSelections
      ...prev,
      [filterColumn]: [] // Limpa todas as seleções para a coluna atual
    }));
    setFilterDropdownOpen(false);
  }, [filterColumn]);

  // Fechar dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Verifica se o clique não foi no dropdown e nem no botão que o abriu
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
          filterButtonRefs.current[filterColumn] && !filterButtonRefs.current[filterColumn].contains(event.target)) {
        setFilterDropdownOpen(false);
        setFilterColumn(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [filterDropdownOpen, filterColumn]);

  // Contagem de ordens de serviço em atraso
  const overdueCount = useMemo(() => {
    return filteredAndSortedData.filter(row => getStatusDates(row).isOverdue).length;
  }, [filteredAndSortedData, getStatusDates]);

  // Função para exportar para Excel com cores e filtro de pendentes hoje
  const exportToExcel = useCallback(() => {
    if (data.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    // Filtra apenas os itens pendentes de hoje (atrasados e vencendo hoje)
    const pendingTodayData = data.filter(row => {
      const { isOverdue, isDueToday } = getStatusDates(row);
      return isOverdue || isDueToday;
    }).map(row => {
      // Mapeia os dados para o formato de exportação, formatando a data e justificativa
      const newRow = {};
      tableHeaders.forEach(header => {
        if (header.key === 'Data Limite') {
          newRow[header.label] = formatDataLimite(row[header.key]);
        } else if (header.key === 'CNPJ / CPF') {
          newRow[header.label] = formatCnpjCpf(row[header.key]);
        } else if (header.key === 'Justificativa do Abono') {
          const { isOverdue, needsAbono } = getStatusDates(row);
          newRow[header.label] = (isOverdue && needsAbono) ? 'FALTA ABONAR' : row[header.key];
        } else {
          newRow[header.label] = row[header.key];
        }
      });
      return newRow;
    });

    if (pendingTodayData.length === 0) {
      alert('Nenhum item pendente para exportar hoje.');
      return;
    }

    const ws_data = [tableHeaders.map(h => h.label)]; // Cabeçalhos com labels "bonitos"
    const ws_cols = tableHeaders.map(h => ({ wch: 20 })); // Largura padrão das colunas

    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Aplica estilos de cor de fundo e cor da fonte
    pendingTodayData.forEach((row, rowIndex) => {
      // Encontra a linha original para aplicar a lógica de cor
      const originalRow = data.find(original =>
        original['Chamado'] === row['Chamado'] &&
        original['Numero Referencia'] === row['Número Referência']
      );
      if (!originalRow) return;

      const { isOverdue, isDueToday, needsAbono } = getStatusDates(originalRow);

      let rowBgColor = '';
      let rowTextColor = '';

      if (isOverdue) {
        rowBgColor = 'C00000'; // Vermelho intenso
        rowTextColor = 'FFFFFF'; // Branco
      } else if (isDueToday) {
        rowBgColor = 'FFC000'; // Amarelo
        rowTextColor = '000000'; // Preto
      }

      // Aplica o estilo de fundo e texto para cada célula da linha
      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para pular o cabeçalho
        if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' }; // Garante que a célula existe

        // Estilo da célula de Justificativa do Abono se for "FALTA ABONAR"
        if (header.key === 'Justificativa do Abono' && needsAbono) {
          ws[cellRef].s = {
            fill: { fgColor: { rgb: '800080' } }, // Roxo intenso
            font: { color: { rgb: 'FFFFFF' }, bold: true }, // Branco e negrito
            alignment: { vertical: 'center', horizontal: 'left' },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          };
        } else if (rowBgColor) {
          // Aplica o estilo da linha para as outras células
          ws[cellRef].s = {
            fill: { fgColor: { rgb: rowBgColor } },
            font: { color: { rgb: rowTextColor } },
            alignment: { vertical: 'center', horizontal: 'left' },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          };
        }
      });
    });

    ws['!cols'] = ws_cols; // Aplica larguras de coluna

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pendentes Hoje');
    saveAs(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), 'Ordens_Servico_Pendentes_Hoje.xlsx');
  }, [data, tableHeaders, getStatusDates, formatDataLimite, formatCnpjCpf]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Dashboard de Ordens de Serviço</h1>
        <div className="action-buttons-container">
          <div className="file-upload-section">
            <label htmlFor="file-upload" className="custom-file-upload">
              <FontAwesomeIcon icon={faUpload} className="icon-spacing" />
              {fileName ? `Arquivo: ${fileName}` : 'Selecionar CSV'}
            </label>
            <input
              type="file"
              id="file-upload"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {selectedFile && (
              <button onClick={handleFileUpload} disabled={loading} className="process-csv-button">
                {loading ? 'Processando...' : 'Processar CSV'}
              </button>
            )}
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
            <button onClick={exportToExcel} className="export-button" disabled={filteredAndSortedData.length === 0}>
              <FontAwesomeIcon icon={faFileExcel} className="icon-spacing" /> Exportar Pendentes Hoje
            </button>
            <div className="overdue-count">
              OSs Atrasadas: <span className="count-number">{overdueCount}</span>
            </div>
          </div>
        </div>
        {error && <p className="error-message">{error}</p>}
      </header>

      <main className="data-table-container">
        {loading && <p className="loading-message">Carregando dados...</p>}
        {!loading && !error && data.length === 0 && (
          <p className="no-data-message">Faça o upload de um arquivo CSV para começar.</p>
        )}
        {!loading && !error && data.length > 0 && filteredAndSortedData.length === 0 && (
          <p className="no-data-message">Nenhum dado corresponde aos filtros aplicados.</p>
        )}

        {!loading && !error && filteredAndSortedData.length > 0 && (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  {tableHeaders.map(header => (
                    <th key={header.key} className={`col-${header.key.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
                      <div className="header-content">
                        <span className="header-label">{header.label}</span>
                        <div className="header-actions">
                          {header.sortable && (
                            <span className="sort-icons" onClick={() => handleSort(header.key)}>
                              <FontAwesomeIcon icon={sortColumn === header.key && sortDirection === 'asc' ? faSortUp : faSortDown} />
                            </span>
                          )}
                          {header.filterable && (
                            <span
                              className={`filter-icon ${filterColumn === header.key && filterDropdownOpen ? 'active' : ''}`}
                              onClick={(e) => handleFilterButtonClick(header.key, e)}
                              ref={el => filterButtonRefs.current[header.key] = el}
                            >
                              <FontAwesomeIcon icon={faFilter} />
                            </span>
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
                        key={header.key}
                        className={getCellClass(row, header.key)}
                      >
                        {getCellContent(row[header.key], header.key, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filterDropdownOpen && filterColumn && (
          <div className="filter-dropdown" ref={filterDropdownRef}>
            <div className="filter-options-container">
              {columnFilterSelections[filterColumn] && columnFilterSelections[filterColumn].map(option => (
                <label key={option} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedFilterOptions[filterColumn]?.includes(option) || false}
                    onChange={(e) => handleFilterOptionChange(option, e.target.checked)}
                  />
                  {option}
                </label>
              ))}
            </div>
            <div className="filter-actions">
              <button onClick={applyColumnFilters}>Aplicar</button>
              <button onClick={clearColumnFilter}>Limpar</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
