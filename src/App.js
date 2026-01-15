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

  // Efeito para aplicar filtros e ordenação
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
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    let count = 0;
    filteredData.forEach(row => {
      const dataLimite = normalizeDate(row['Data Limite']);
      if (dataLimite && dataLimite < today) {
        count++;
      }
    });
    setOverdueCount(count);
  }, [filteredData, normalizeDate]);

  // Função para determinar a classe CSS da linha com base na Data Limite
  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimite = normalizeDate(row['Data Limite']);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    if (!dataLimite) return '';

    // Se a data limite for anterior a hoje
    if (dataLimite < today) {
      // Verifica se a justificativa está vazia ou é "FALTA ABONAR"
      const justificativa = row['Justificativa do Abono'];
      if (isJustificativaVazia(justificativa)) {
        return 'overdue-row-strong'; // Vermelho forte se atrasado e sem abono
      } else {
        return 'overdue-row'; // Vermelho normal se atrasado e com abono
      }
    }
    // Se a data limite for hoje
    if (dataLimite.getTime() === today.getTime()) {
      return 'due-today-row'; // Amarelo se vencendo hoje
    }

    return ''; // Nenhuma classe se não for atrasado nem vencendo hoje
  }, [normalizeDate, isJustificativaVazia]);


  // Função para obter o conteúdo da célula e sua classe CSS
  const getCellContentAndClassName = useCallback((row, header) => {
    let content = row[header];
    let className = '';

    // Lógica para CNPJ / CPF
    if (header === 'CNPJ / CPF') {
      if (typeof content === 'string') {
        content = content.replace(/^=?"?|"?$/g, ''); // Remove = e aspas
      }
    }

    // Lógica para "FALTA ABONAR" (célula roxa)
    if (header === 'Justificativa do Abono') {
      const dataLimite = normalizeDate(row['Data Limite']);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dataLimite && dataLimite < today && isJustificativaVazia(content)) {
        content = 'FALTA ABONAR';
        className = 'falta-abonar';
      }
    }

    return { content, className };
  }, [normalizeDate, isJustificativaVazia]);

  // Função para carregar dados do backend
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const response = await axios.get(`${apiUrl}/data`);
      setData(response.data);
    } catch (err) {
      console.error("Erro ao buscar dados:", err);
      setError('Erro ao carregar os dados. Tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Efeito para carregar dados na montagem do componente
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Função para lidar com o upload de arquivos
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      await axios.post(`${apiUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      alert('Arquivo enviado e dados atualizados com sucesso!');
      fetchData(); // Recarrega os dados após o upload
    } catch (err) {
      console.error("Erro ao fazer upload:", err);
      setError('Erro ao carregar o arquivo. Verifique o formato e tente novamente.');
    } finally {
      setLoading(false);
      event.target.value = null; // Limpa o input para permitir upload do mesmo arquivo novamente
    }
  };

  // Funções de filtro
  const getUniqueColumnValues = useCallback((columnName) => {
    const values = new Set();
    filteredData.forEach(row => {
      const value = row[columnName];
      if (value !== undefined && value !== null) {
        values.add(String(value));
      }
    });
    return Array.from(values).sort((a, b) => {
      if (columnName === 'Data Limite') {
        const dateA = normalizeDate(a);
        const dateB = normalizeDate(b);
        if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        return 0;
      }
      return a.localeCompare(b);
    });
  }, [filteredData, normalizeDate]);

  const toggleFilterDropdown = useCallback((header, e) => {
    e.stopPropagation(); // Impede que o clique se propague para o document
    if (openDropdown === header) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(header);
      // Inicializa as seleções de filtro para o novo dropdown
      const currentSelections = activeFilters[header] || {};
      const initialSelections = {};
      getUniqueColumnValues(header).forEach(value => {
        initialSelections[value] = currentSelections[value] !== undefined ? currentSelections[value] : true;
      });
      setFilterSelections(initialSelections);

      // Calcula a posição do dropdown
      const iconRect = filterIconRefs.current[header].getBoundingClientRect();
      const dropdownWidth = 220; // Largura mínima do dropdown
      const dropdownHeight = 300; // Altura máxima do dropdown
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = iconRect.bottom + window.scrollY + 5; // Padrão: abaixo do ícone
      let left = iconRect.left + window.scrollX;

      // Ajusta se o dropdown sair da tela para a direita
      if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 10; // 10px de margem
      }
      // Ajusta se o dropdown sair da tela para a esquerda (se o ajuste da direita não for suficiente)
      if (left < 0) {
        left = 10;
      }

      // Ajusta se o dropdown sair da tela para baixo
      if (top + dropdownHeight > viewportHeight + window.scrollY) {
        top = iconRect.top + window.scrollY - dropdownHeight - 5; // Acima do ícone
        if (top < window.scrollY) { // Se ainda sair da tela para cima, posiciona no topo da viewport
          top = window.scrollY + 10;
        }
      }

      setFilterDropdownPosition({ top, left });
    }
  }, [openDropdown, activeFilters, getUniqueColumnValues]);

  const handleFilterSelectionChange = useCallback((value) => {
    setFilterSelections(prev => ({
      ...prev,
      [value]: !prev[value]
    }));
  }, []);

  const applyFilters = useCallback((columnName) => {
    setActiveFilters(prev => ({
      ...prev,
      [columnName]: filterSelections
    }));
    setOpenDropdown(null);
  }, [filterSelections]);

  const clearFilters = useCallback((columnName) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnName];
      return newFilters;
    });
    setFilterSelections({}); // Limpa as seleções temporárias
    setOpenDropdown(null);
  }, []);

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
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target) &&
          !Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target))) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

  // Funções de ordenação
  const requestSort = useCallback((key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  }, [sortConfig]);

  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) {
      return null;
    }
    if (sortConfig.direction === 'ascending') {
      return faSortUp;
    }
    return faSortDown;
  }, [sortConfig]);

  // Função para exportar para Excel
  const exportToExcel = useCallback(() => {
    // Mapeia os dados filtrados para um formato que o XLSX.utils.json_to_sheet entenda
    const dataForExcel = filteredData.map(row => {
      const newRow = {};
      tableHeaders.forEach(header => {
        const { content } = getCellContentAndClassName(row, header); // Usa a mesma lógica de formatação da célula
        newRow[header] = content;
      });
      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(dataForExcel, { header: tableHeaders });

    // Aplica estilos aos cabeçalhos
    tableHeaders.forEach((header, colIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (!ws[cellRef]) ws[cellRef] = {};
      ws[cellRef].s = {
        font: { color: { rgb: "FFFFFF" }, bold: true },
        fill: { fgColor: { rgb: "4A4A6A" } }, // Cor de fundo do cabeçalho
        alignment: { horizontal: "left", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "3A3A5A" } },
          bottom: { style: "thin", color: { rgb: "3A3A5A" } },
          left: { style: "thin", color: { rgb: "3A3A5A" } },
          right: { style: "thin", color: { rgb: "3A3A5A" } },
        }
      };
    });

    // Aplica estilos às células de dados
    filteredData.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row); // Obtém a classe da linha
      let rowBgColor = "2A2A4A"; // Cor de fundo padrão da célula (azul escuro)

      if (rowClass === 'overdue-row-strong') {
        rowBgColor = "CC0000"; // Vermelho forte
      } else if (rowClass === 'overdue-row') {
        rowBgColor = "FF6666"; // Vermelho normal
      } else if (rowClass === 'due-today-row') {
        rowBgColor = "FFFF99"; // Amarelo
      }

      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para pular o cabeçalho
        if (!ws[cellRef]) ws[cellRef] = {};

        const { content, className } = getCellContentAndClassName(row, header);

        let cellStyle = {
          font: { color: { rgb: "E0E0E0" } }, // Cor de texto padrão
          fill: { fgColor: { rgb: rowBgColor } }, // Cor de fundo da linha
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "3A3A5A" } },
            bottom: { style: "thin", color: { rgb: "3A3A5A" } },
            left: { style: "thin", color: { rgb: "3A3A5A" } },
            right: { style: "thin", color: { rgb: "3A3A5A" } },
          }
        };

        // Sobrescreve o estilo da célula se for "FALTA ABONAR" (prioridade)
        if (className === 'falta-abonar') {
          cellStyle.font = { color: { rgb: "FFFFFF" }, bold: true }; // Texto branco e negrito
          cellStyle.fill = { fgColor: { rgb: "800080" } }; // Roxo
        }

        ws[cellRef].s = cellStyle; // Aplica o estilo à célula
        ws[cellRef].v = content; // Garante que o conteúdo formatado seja o valor da célula
        ws[cellRef].t = 's'; // Garante que o Excel trate como texto
      });
    });

    // Ajusta a largura das colunas
    const wscols = tableHeaders.map(header => {
      let minWidth = 10; // Largura mínima padrão
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

      const contentWidth = Math.max(...filteredData.map(row => String(row[header] || '').length));

      return {
        wch: Math.max(minWidth, contentWidth) + 2
      };
    });
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório de OSs");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'relatorio_oss.xlsx');
  }, [filteredData, tableHeaders, getCellContentAndClassName, getRowClassByDataLimite]);


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
