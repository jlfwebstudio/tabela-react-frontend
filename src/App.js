// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
// eslint-disable-next-line no-unused-vars
import { saveAs } from 'file-saver'; // 'saveAs' é usado, mas o ESLint pode não detectar. Desabilitando a regra aqui.
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload, faSearch } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [filterSelections, setFilterSelections] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

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

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // REMOVIDO: A função normalizeStatusValue não está sendo usada e foi removida.
  // const normalizeStatusValue = useCallback((status) => {
  //   const normalized = normalizeForComparison(status);
  //   if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
  //   if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
  //   if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
  //   if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
  //   if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
  //   return status;
  // }, [normalizeForComparison]);

  // Função para formatar a Data Limite para DD/MM/AAAA
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // Tenta parsear com o formato DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      if (parts) {
        const [, day, month, year] = parts;
        return `${day}/${month}/${year}`;
      }
      // Fallback para Date object se o regex falhar
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString; // Retorna a string original se não conseguir formatar
  }, []);

  // Função para formatar CNPJ/CPF (agora o backend já remove "=""")
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

  // Efeito para calcular o contador de OSs em atraso (AGORA CONTA TODOS OS ATRASADOS)
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`); // Formato MM/DD/YYYY para Date
          dataLimite.setHours(0, 0, 0, 0);

          // CONTA TODOS OS CHAMADOS COM DATA LIMITE < DATA DO AGORA
          return dataLimite < today;
        }
      } catch (e) {
        console.error("Erro ao parsear data para contador:", dataLimiteStr, e);
      }
      return false;
    }).length;

    setOverdueCount(count);
  }, [filteredData]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        let isFilterIconClick = false;
        for (const header in filterIconRefs.current) {
          if (filterIconRefs.current[header] && filterIconRefs.current[header].contains(event.target)) {
            isFilterIconClick = true;
            break;
          }
        }
        if (!isFilterIconClick) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Lógica de filtragem principal (filtros de coluna + pesquisa global)
  useEffect(() => {
    let currentFilteredData = [...data];

    // Aplicar pesquisa global
    if (searchTerm) {
      const normalizedSearchTerm = normalizeForComparison(searchTerm);
      currentFilteredData = currentFilteredData.filter(row =>
        tableHeaders.some(header => {
          const cellValue = String(row[header] || '');
          return normalizeForComparison(cellValue).includes(normalizedSearchTerm);
        })
      );
    }

    // Aplicar filtros de coluna
    Object.keys(activeFilters).forEach(header => {
      const selectedValues = Object.keys(activeFilters[header]).filter(key => activeFilters[header][key]);
      if (selectedValues.length > 0) {
        currentFilteredData = currentFilteredData.filter(row => {
          const rowValue = String(row[header] || '');
          return selectedValues.includes(rowValue);
        });
      }
    });

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, searchTerm, normalizeForComparison, tableHeaders]);


  // Lógica de ordenação
  const sortedData = useMemo(() => {
    if (!sortConfig.key || filteredData.length === 0) {
      return filteredData;
    }

    const sortableItems = [...filteredData];
    sortableItems.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Tratamento especial para 'Data Limite'
      if (sortConfig.key === 'Data Limite') {
        aValue = new Date(formatDataLimite(aValue).split('/').reverse().join('-'));
        bValue = new Date(formatDataLimite(bValue).split('/').reverse().join('-'));
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = normalizeForComparison(aValue);
        bValue = normalizeForComparison(bValue);
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
    return sortableItems;
  }, [filteredData, sortConfig, normalizeForComparison, formatDataLimite]);


  const getUniqueColumnValues = useCallback((header) => {
    const values = new Set();
    data.forEach(row => {
      values.add(row[header] || '');
    });
    return Array.from(values).sort((a, b) => {
      if (a === '') return 1; // Coloca vazios no final
      if (b === '') return -1;
      return String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' });
    });
  }, [data]);

  const toggleFilterDropdown = useCallback((header, event) => {
    event.stopPropagation(); // Impede que o clique se propague e feche o dropdown imediatamente
    setOpenDropdown(openDropdown === header ? null : header);

    if (openDropdown !== header && filterIconRefs.current[header]) {
      const iconRect = filterIconRefs.current[header].getBoundingClientRect();
      // Ajusta a posição para que o dropdown apareça abaixo e alinhado com o ícone
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px de margem
        left: iconRect.left + window.scrollX,
      });
    }
  }, [openDropdown]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const applyFilters = useCallback((header) => {
    setActiveFilters(prev => ({
      ...prev,
      [header]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilters = useCallback((header) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[header];
      return newFilters;
    });
    setFilterSelections({}); // Limpa as seleções do dropdown atual
    setOpenDropdown(null);
  }, []);

  const toggleSelectAll = useCallback((header, selectAll) => {
    const uniqueValues = getUniqueColumnValues(header);
    const newSelections = {};
    uniqueValues.forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const faltaAbonar = normalizeForComparison(row['Justificativa do Abono'] || '').includes('FALTA ABONAR');

    if (!dataLimiteStr) return '';

    try {
      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (parts) {
        const [, day, month, year] = parts;
        const dataLimite = new Date(`${month}/${day}/${year}`);
        dataLimite.setHours(0, 0, 0, 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dataLimite < today) {
          return 'overdue-strong'; // Vermelho forte para TODOS atrasados
        } else if (dataLimite.getTime() === today.getTime()) {
          return 'due-today'; // Amarelo para hoje
        }
      }
    } catch (e) {
      console.error("Erro ao parsear data para classe de linha:", dataLimiteStr, e);
    }

    return ''; // Nenhuma classe especial
  }, [normalizeForComparison]);

  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = `col-${header.toLowerCase().replace(/ /g, '-')}`;

    if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }

    // Aplica a classe 'falta-abonar' se a célula for 'Justificativa do Abono' e contiver 'FALTA ABONAR'
    if (header === 'Justificativa do Abono' && normalizeForComparison(content || '').includes('FALTA ABONAR')) {
      className += ' falta-abonar';
    }

    // eslint-disable-next-line no-unused-vars
    return { content, className }; // 'content' é usado no JSX, mas o ESLint pode se confundir.
  }, [formatDataLimite, formatCnpjCpf, normalizeForComparison]);


  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa dados anteriores
    setFilteredData([]); // Limpa dados filtrados anteriores
    setActiveFilters({}); // Limpa filtros ativos
    setFilterSelections({}); // Limpa seleções de filtro
    setOpenDropdown(null); // Fecha qualquer dropdown aberto
    setSearchTerm(''); // Limpa o termo de pesquisa

    const formData = new FormData();
    formData.append('file', file); // Nome do campo corrigido para 'file'

    try {
      const response = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
      setFilteredData(response.data); // Inicializa filteredData com todos os dados
    } catch (err) {
      console.error('Erro ao fazer upload:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  const exportDataToExcel = useCallback((dataToExport, filename) => {
    if (dataToExport.length === 0) {
      alert('Nenhum registro para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Estilos para o cabeçalho
    const headerStyle = {
      fill: { fgColor: { rgb: "4472C4" } }, // Azul escuro
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };

    // Aplica estilo ao cabeçalho
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].v = header; // Garante que o valor do cabeçalho esteja lá
      ws[cellRef].s = headerStyle;
    });

    // Aplica estilos de linha e célula
    dataToExport.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row);
      let fillColor = null;
      let fontColor = { rgb: "000000" }; // Padrão preto

      if (rowClass === 'overdue-strong') {
        fillColor = { rgb: "FF0000" }; // Vermelho forte
        fontColor = { rgb: "FFFFFF" }; // Branco
      } else if (rowClass === 'due-today') {
        fillColor = { rgb: "FFFF00" }; // Amarelo
        fontColor = { rgb: "000000" }; // Preto
      } else if (rowIndex % 2 === 0) { // Linhas pares (fundo cinza claro)
        fillColor = { rgb: "F0F0F0" };
      } else { // Linhas ímpares (fundo branco)
        fillColor = { rgb: "FFFFFF" };
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        if (!ws[cellRef]) ws[cellRef] = {};

        // Verifica se a célula é "FALTA ABONAR" e aplica estilo roxo com prioridade
        const cellContent = row[header] || '';
        if (header === 'Justificativa do Abono' && normalizeForComparison(cellContent).includes('FALTA ABONAR')) {
          ws[cellRef].s = {
            fill: { fgColor: { rgb: "800080" } }, // Roxo
            font: { color: { rgb: "FFFFFF" }, bold: true },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } },
            },
          };
        } else {
          // Aplica o estilo de linha (cor de fundo e fonte)
          ws[cellRef].s = {
            fill: { fgColor: fillColor },
            font: { color: fontColor },
            alignment: { horizontal: "left", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } },
            },
          };
        }
      });
    });

    // Ajusta a largura das colunas automaticamente
    const colWidths = tableHeaders.map(header => ({
      wch: Math.max(
        header.length,
        ...dataToExport.map(row => String(row[header] || '').length)
      ) + 2 // +2 para um pequeno padding
    }));
    ws['!cols'] = colWidths;


    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, filename);
  }, [tableHeaders, getRowClassByDataLimite, normalizeForComparison]);

  const handleExportPendingToExcel = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingData = data.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      try {
        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(`${month}/${day}/${year}`);
          dataLimite.setHours(0, 0, 0, 0);
          return dataLimite <= today;
        }
      } catch (e) {
        console.error("Erro ao parsear data para exportação de pendências:", dataLimiteStr, e);
      }
      return false;
    });

    if (pendingData.length === 0) {
      alert('Nenhum registro de pendência do dia encontrado para exportar.');
      return;
    }

    exportDataToExcel(pendingData, 'pendencias_do_dia.xlsx');
  }, [data, exportDataToExcel]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Gerenciador de OS</h1>

        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> Carregar CSV
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {selectedFileName && <span className="file-name-display">{selectedFileName}</span>}
        </div>

        {data.length > 0 && (
          <>
            <div className="action-buttons">
              <button onClick={() => exportDataToExcel(filteredData, 'tabela_completa.xlsx')} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Tabela Completa
              </button>
              <button onClick={handleExportPendingToExcel} className="export-button">
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Pendências do Dia
              </button>
            </div>
          </>
        )}
        {overdueCount > 0 && (
          <div className="overdue-count">
            OSs em Atraso: {overdueCount}
          </div>
        )}

        {/* CAMPO DE PESQUISA GLOBAL */}
        {data.length > 0 && (
          <div className="search-bar-container">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar em toda a tabela..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="global-search-input"
            />
          </div>
        )}
      </header>

      {loading && <div className="loading-message">Carregando...</div>}
      {error && <div className="error-message">{error}</div>}

      {data.length > 0 && (
        <div className="data-table-container" translate="no">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
                    <div className="header-content">
                      <span className="sortable-header" onClick={() => requestSort(header)}>
                        {header}
                        {sortConfig.key === header && (
                          <FontAwesomeIcon
                            icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                            className="sort-icon"
                          />
                        )}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(event) => toggleFilterDropdown(header, event)}
                        ref={el => filterIconRefs.current[header] = el}
                      />
                    </div>

                    {openDropdown === header && (
                      <div
                        className="filter-dropdown"
                        ref={filterDropdownRef}
                        style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                      >
                        <div className="filter-options-container">
                          {getUniqueColumnValues(header).map(value => (
                            <label key={value} className="filter-option">
                              <input
                                type="checkbox"
                                checked={filterSelections[value] || false}
                                onChange={() => handleFilterSelectionChange(value)}
                              />
                              {value === '' ? '(Vazio)' : value}
                            </label>
                          ))}
                        </div>
                        <div className="filter-actions">
                          <button onClick={() => toggleSelectAll(header, true)}>Selecionar Tudo</button>
                          <button onClick={() => toggleSelectAll(header, false)}>Desmarcar Tudo</button>
                          <button onClick={() => applyFilters(header)}>Aplicar</button>
                          <button onClick={() => clearFilters(header)}>Limpar</button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    // eslint-disable-next-line no-unused-vars
                    const { content, className } = getCellContentAndClassName(row, header); // 'content' é usado no JSX
                    return (
                      <td key={header} className={className}>
                        {content}
                      </td>
                    );
                  })}
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
