// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({}); // Filtros atualmente aplicados {columnName: {value1: true, value2: false}}
  const [filterSelections, setFilterSelections] = useState({}); // Seleções temporárias no dropdown
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0); // Contador de OSs em atraso (Data Limite < hoje)
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

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
    'Justificativa do Abono'
  ], []);

  // Status permitidos para exibição e filtro
  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  // Função para normalizar strings para comparação (maiúsculas, sem acentos, trim)
  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string') return str;
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // Função para normalizar valores de status específicos
  const normalizeStatusValue = useCallback((status) => {
    if (typeof status !== 'string') return status;
    let normalized = status.trim().toUpperCase();
    if (normalized.includes('OS ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    return normalized;
  }, []);

  // Função para normalizar datas para comparação (apenas DD/MM/AAAA)
  const normalizeDate = useCallback((dateString) => {
    if (!dateString) return null;
    const parts = dateString.split(' ')[0].split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return null;
  }, []);

  // Função auxiliar para verificar se a justificativa está vazia ou é "FALTA ABONAR"
  const isJustificativaVazia = useCallback((justificativa) => {
    const normalizedJustificativa = normalizeForComparison(justificativa);
    return !normalizedJustificativa || normalizedJustificativa === 'FALTA ABONAR';
  }, [normalizeForComparison]);

  // Efeito para aplicar filtros e ordenação sempre que 'data' ou 'activeFilters' mudar
  useEffect(() => {
    let currentFilteredData = [...data];

    currentFilteredData = currentFilteredData.filter(row => {
      const normalizedStatus = normalizeStatusValue(row['Status']);
      return allowedStatuses.includes(normalizedStatus);
    });

    Object.keys(activeFilters).forEach(columnName => {
      const selectedValues = activeFilters[columnName];
      const hasActiveSelection = Object.values(selectedValues).some(Boolean);
      if (hasActiveSelection) {
        currentFilteredData = currentFilteredData.filter(row => {
          const cellValue = row[columnName];
          const normalizedCellValue = normalizeForComparison(cellValue);
          return Object.keys(selectedValues).some(filterValue =>
            selectedValues[filterValue] && normalizeForComparison(filterValue) === normalizedCellValue
          );
        });
      }
    });

    if (sortConfig.key) {
      currentFilteredData.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (sortConfig.key === 'Data Limite') {
          const dateA = normalizeDate(aValue);
          const dateB = normalizeDate(bValue);

          if (dateA && dateB) {
            return sortConfig.direction === 'ascending' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
          }
          return 0;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        }
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        }
        return 0;
      });
    }

    setFilteredData(currentFilteredData);
  }, [data, activeFilters, sortConfig, normalizeForComparison, normalizeStatusValue, normalizeDate, allowedStatuses]);

  // Efeito para calcular o contador de OSs em atraso (Data Limite < hoje)
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let count = 0;
    filteredData.forEach(row => {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = normalizeDate(dataLimiteStr);
      const justificativa = row['Justificativa do Abono'];

      // Contabiliza como atraso APENAS se a data limite passou E a justificativa estiver vazia/FALTA ABONAR
      if (dataLimite && dataLimite.getTime() < today.getTime() && isJustificativaVazia(justificativa)) {
        count++;
      }
    });
    setOverdueCount(count);
  }, [filteredData, normalizeDate, isJustificativaVazia]);

  // Função para lidar com o upload do arquivo
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]); // Limpa os dados atuais antes de carregar novos

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Usa a variável de ambiente para a URL da API
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:10000';
      const response = await axios.post(`${apiUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Mapeia os dados para garantir que todas as colunas estejam presentes e normalizadas
      const processedData = response.data.map(row => {
        const newRow = {};
        tableHeaders.forEach(header => {
          let value = row[header] !== undefined ? row[header] : ''; // Garante que a coluna exista, mesmo que vazia

          // Normalização específica para CNPJ / CPF
          if (header === 'CNPJ / CPF' && typeof value === 'string') {
            value = value.replace(/^=?"?|"?$/g, ''); // Remove '=' e aspas duplas do início/fim
          }
          newRow[header] = value;
        });
        return newRow;
      });

      setData(processedData);
      setFilteredData(processedData); // Inicializa filteredData com os dados carregados
      setError(null);
    } catch (err) {
      console.error("Erro ao carregar o arquivo:", err);
      if (err.response) {
        setError(`Erro ao carregar o arquivo: ${err.response.data.message || err.response.statusText}. Verifique o formato e tente novamente.`);
      } else if (err.request) {
        setError("Erro de rede: Não foi possível conectar ao servidor. Verifique sua conexão ou a URL da API.");
      } else {
        setError("Erro desconhecido ao processar o arquivo.");
      }
      setData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  // Função para alternar a ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  // Função para obter o ícone de ordenação
  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'ascending' ? faSortUp : faSortDown;
  }, [sortConfig]);

  // Função para obter valores únicos de uma coluna para o filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    filteredData.forEach(row => {
      const value = row[columnName];
      // Se for Justificativa do Abono e estiver vazia e atrasada, mostra "FALTA ABONAR"
      if (columnName === 'Justificativa do Abono' && isJustificativaVazia(value) && getRowClassByDataLimite(row).includes('overdue-row')) {
        values.add('FALTA ABONAR');
      } else {
        values.add(value === null || value === undefined || value === '' ? '' : String(value));
      }
    });
    // Garante que "FALTA ABONAR" seja uma opção de filtro se aplicável
    if (columnName === 'Justificativa do Abono' && filteredData.some(row => isJustificativaVazia(row['Justificativa do Abono']) && getRowClassByDataLimite(row).includes('overdue-row'))) {
      values.add('FALTA ABONAR');
    }
    const sortedValues = Array.from(values).sort((a, b) => {
      if (a === '') return -1; // Vazio primeiro
      if (b === '') return 1;
      return String(a).localeCompare(String(b));
    });
    return sortedValues;
  }, [filteredData, isJustificativaVazia]); // Adicionado isJustificativaVazia aqui

  // Função para alternar o dropdown de filtro
  const toggleFilterDropdown = useCallback((columnName, event) => {
    if (openDropdown === columnName) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(columnName);
      // Inicializa as seleções de filtro para o novo dropdown
      const currentActiveFilters = activeFilters[columnName] || {};
      const initialSelections = {};
      getUniqueColumnValues(columnName).forEach(value => {
        initialSelections[value] = currentActiveFilters[value] !== undefined ? currentActiveFilters[value] : true; // Todos selecionados por padrão
      });
      setFilterSelections(initialSelections);

      // Posiciona o dropdown
      const iconRect = event.currentTarget.getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX
      });
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  // Função para lidar com a mudança de seleção no filtro
  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  // Função para aplicar os filtros
  const applyFilters = useCallback((columnName) => {
    setActiveFilters(prev => ({
      ...prev,
      [columnName]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  // Função para limpar os filtros de uma coluna
  const clearFilters = useCallback((columnName) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnName]; // Remove o filtro da coluna
      return newFilters;
    });
    setOpenDropdown(null);
  }, []);

  // Função para selecionar/desmarcar tudo no filtro
  const toggleSelectAll = useCallback((columnName, selectAll) => {
    const newSelections = {};
    getUniqueColumnValues(columnName).forEach(value => {
      newSelections[value] = selectAll;
    });
    setFilterSelections(newSelections);
  }, [getUniqueColumnValues]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        let isFilterIconClick = false;
        for (const key in filterIconRefs.current) {
          if (filterIconRefs.current[key] && filterIconRefs.current[key].contains(event.target)) {
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
  }, [filterDropdownRef, filterIconRefs]);

  // Função para determinar a classe da linha com base na Data Limite e Justificativa
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativa = row['Justificativa do Abono'];
    const dataLimite = normalizeDate(dataLimiteStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!dataLimite) return '';

    // Data Limite < Data de Hoje
    if (dataLimite.getTime() < today.getTime()) {
      // Se a justificativa está vazia ou é "FALTA ABONAR", vermelho forte
      if (isJustificativaVazia(justificativa)) {
        return 'overdue-row-strong';
      }
      // Se a justificativa está preenchida (não vazia/FALTA ABONAR), vermelho normal
      return 'overdue-row';
    }

    // Data Limite = Data de Hoje
    if (dataLimite.getTime() === today.getTime()) {
      return 'due-today-row';
    }

    return '';
  }, [normalizeDate, isJustificativaVazia]);

  // Função para obter o conteúdo e a classe da célula
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Lógica para a célula "Justificativa do Abono"
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const dataLimite = normalizeDate(dataLimiteStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Se a data limite passou E a justificativa está vazia, exibe "FALTA ABONAR" e aplica a classe roxa
      if (dataLimite && dataLimite.getTime() < today.getTime() && isJustificativaVazia(content)) {
        content = 'FALTA ABONAR';
        className = 'falta-abonar';
      }
    }

    // Normalização para CNPJ / CPF na exibição
    if (header === 'CNPJ / CPF' && typeof content === 'string') {
      content = content.replace(/^=?"?|"?$/g, ''); // Remove '=' e aspas duplas
    }

    return { content, className };
  }, [normalizeDate, isJustificativaVazia]);


  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    const ws = XLSX.utils.json_to_sheet([]);

    // Adiciona cabeçalhos com estilo
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "4A4A6A" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "6A6A8A" } },
        bottom: { style: "thin", color: { rgb: "6A6A8A" } },
        left: { style: "thin", color: { rgb: "6A6A8A" } },
        right: { style: "thin", color: { rgb: "6A6A8A" } },
      }
    };

    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      ws[cellRef] = { v: header, t: 's', s: headerStyle };
    });

    // Adiciona os dados com estilos condicionais
    filteredData.forEach((row, rowIndex) => {
      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        const { content, className } = getCellContentAndClassName(row, header); // Obtém o conteúdo formatado e a classe

        let cellValue = content;
        let cellType = 's'; // Tipo string por padrão

        // Tenta converter para número se apropriado
        if (typeof cellValue === 'number') {
          cellType = 'n';
        } else if (header === 'Data Limite' && content) {
          // Se for Data Limite, garante que seja um formato de data para o Excel
          const dateObj = normalizeDate(content);
          if (dateObj) {
            cellValue = dateObj; // Excel lida melhor com objetos Date
            cellType = 'd';
          }
        }

        ws[cellRef] = { v: cellValue, t: cellType };

        // Estilo padrão da célula
        let cellStyle = {
          font: { color: { rgb: "E0E0E0" } }, // Cor da fonte padrão
          alignment: { vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "4A4A6A" } },
            bottom: { style: "thin", color: { rgb: "4A4A6A" } },
            left: { style: "thin", color: { rgb: "4A4A6A" } },
            right: { style: "thin", color: { rgb: "4A4A6A" } },
          }
        };

        // Usando as mesmas classes CSS para consistência de cores
        const rowClass = getRowClassByDataLimite(row);

        if (rowClass === 'overdue-row-strong') {
          cellStyle.fill = { fgColor: { rgb: "CC0000" } }; // Vermelho forte
          cellStyle.font = { color: { rgb: "FFFFFF" } }; // Texto branco
        } else if (rowClass === 'overdue-row') {
          cellStyle.fill = { fgColor: { rgb: "FF6666" } }; // Vermelho normal
          cellStyle.font = { color: { rgb: "333333" } }; // Texto escuro
        } else if (rowClass === 'due-today-row') {
          cellStyle.fill = { fgColor: { rgb: "FFFF99" } }; // Amarelo sutil
          cellStyle.font = { color: { rgb: "333333" } }; // Texto escuro
        } else {
          cellStyle.fill = { fgColor: { rgb: "2A2A4A" } }; // Cor padrão da linha (fundo da tabela)
          cellStyle.font = { color: { rgb: "E0E0E0" } }; // Cor da fonte padrão
        }

        // Cor roxa para "FALTA ABONAR" (sobrescreve a cor da linha)
        if (className === 'falta-abonar') { // Usa a classe para identificar
          cellStyle.font = { color: { rgb: "FFFFFF" }, bold: true }; // Texto branco e negrito
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
        }

        ws[cellRef].s = cellStyle;
      });
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let minWidth = header.length; // Largura mínima baseada no cabeçalho
      // Larguras específicas para colunas que precisam de mais espaço
      if (header === 'Serviço') minWidth = 25;
      if (header === 'Contratante') minWidth = 18;
      if (header === 'Status') minWidth = 18;
      if (header === 'Justificativa do Abono') minWidth = 30;
      if (header === 'Técnico') minWidth = 20;
      if (header === 'Prestador') minWidth = 25;
      if (header === 'Cidade') minWidth = 15;
      if (header === 'CNPJ / CPF') minWidth = 18;
      if (header === 'Numero Referencia') minWidth = 15;
      if (header === 'Data Limite') minWidth = 15;

      // Encontra a largura máxima do conteúdo da coluna
      const contentWidth = Math.max(...filteredData.map(row => String(row[header] || '').length));

      return {
        wch: Math.max(minWidth, contentWidth) + 2 // Adiciona um padding
      };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório de OSs");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'relatorio_oss.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, normalizeDate, getRowClassByDataLimite]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Relatório de Ordens de Serviço</h1>
      </header>

      <div className="controls-container">
        <div className="file-upload-section">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} /> Carregar CSV
          </label>
          <input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
          {selectedFileName && <span className="file-name-display">Arquivo: {selectedFileName}</span>}
        </div>

        <div className="info-actions-container">
          <div className="overdue-count">
            OSs em Atraso: <span className="count-number">{overdueCount}</span>
          </div>
          <button onClick={exportToExcel} className="export-button" disabled={filteredData.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} /> Exportar para Excel
          </button>
        </div>
      </div>

      {loading && <div className="loading-message">Carregando dados...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && filteredData.length > 0 && (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header}>
                    <div className="header-content">
                      <span onClick={() => requestSort(header)} className="sortable-header">
                        {header}
                        {getSortIcon(header) && <FontAwesomeIcon icon={getSortIcon(header)} className="sort-icon" />}
                      </span>
                      <FontAwesomeIcon
                        icon={faFilter}
                        className={`filter-icon ${activeFilters[header] && Object.values(activeFilters[header]).some(Boolean) ? 'filter-active' : ''}`}
                        onClick={(e) => toggleFilterDropdown(header, e)}
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
              {filteredData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    const { content, className } = getCellContentAndClassName(row, header);
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
